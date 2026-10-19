import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { admin } from "@/lib/supabase/admin";

export const WEBHOOK_EVENTS = [
  "email.sent",
  "email.delivered",
  "email.bounced",
  "email.complained",
  "email.opened",
  "email.clicked",
  "email.failed",
  "contact.unsubscribed",
  "workspace.paused",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const newWebhookSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

/** Fan an event out to every matching endpoint (delivered later by the worker). */
export async function emit(workspaceId: string, type: WebhookEvent, data: Record<string, unknown>) {
  const db = admin();
  const { data: endpoints } = await db
    .from("webhook_endpoints")
    .select("id, events")
    .eq("workspace_id", workspaceId)
    .eq("active", true);
  const targets = (endpoints ?? []).filter((e) => e.events.length === 0 || e.events.includes(type));
  if (!targets.length) return;
  const payload = { type, created_at: new Date().toISOString(), data };
  await db.from("webhook_deliveries").insert(
    targets.map((e) => ({ endpoint_id: e.id, workspace_id: workspaceId, event_type: type, payload })),
  );
}

/**
 * Signature scheme (Stripe-style):
 *   DeskFrog-Signature: t=<unix>,v1=<hex hmac_sha256(secret, `${t}.${body}`)>
 */
export function sign(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

const BACKOFF_MIN = [1, 5, 30, 120, 360, 720, 1440]; // minutes

export async function deliverWebhooks(batch = 50) {
  const db = admin();
  const { data: jobs, error } = await db.rpc("claim_webhook_deliveries", { batch_size: batch });
  if (error) throw new Error(error.message);
  let delivered = 0;

  for (const job of jobs ?? []) {
    const { data: ep } = await db.from("webhook_endpoints").select("url, secret, active").eq("id", job.endpoint_id).single();
    if (!ep?.active) {
      await db.from("webhook_deliveries").update({ status: "failed", last_error: "endpoint disabled" }).eq("id", job.id);
      continue;
    }
    const bodyStr = JSON.stringify({ id: job.id, ...job.payload });
    let code = 0;
    let errMsg: string | null = null;
    try {
      const res = await fetch(ep.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "DeskFrogMail-Webhooks/1.0",
          "deskfrog-signature": sign(ep.secret, bodyStr),
          "deskfrog-event": job.event_type,
          "deskfrog-delivery": job.id,
        },
        body: bodyStr,
        signal: AbortSignal.timeout(10_000),
      });
      code = res.status;
      if (!res.ok) errMsg = `HTTP ${res.status}`;
    } catch (e) {
      errMsg = (e as Error).message;
    }

    if (!errMsg) {
      delivered++;
      await db.from("webhook_deliveries").update({ status: "delivered", response_code: code, last_error: null }).eq("id", job.id);
    } else {
      const giveUp = job.attempts >= BACKOFF_MIN.length;
      const next = new Date(Date.now() + BACKOFF_MIN[Math.min(job.attempts - 1, BACKOFF_MIN.length - 1)] * 60_000);
      await db
        .from("webhook_deliveries")
        .update({
          status: giveUp ? "failed" : "pending",
          response_code: code || null,
          last_error: errMsg,
          next_attempt_at: next.toISOString(),
        })
        .eq("id", job.id);
    }
  }
  return { claimed: jobs?.length ?? 0, delivered };
}
