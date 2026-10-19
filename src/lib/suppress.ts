import "server-only";
import { admin } from "@/lib/supabase/admin";
import { emit } from "@/lib/webhooks";

/** Unsubscribe a contact from all marketing in its workspace. Idempotent. */
export async function unsubscribeContact(contactId: string, source: string, messageId?: string | null) {
  const db = admin();
  const { data: c } = await db
    .from("contacts")
    .select("id, workspace_id, email, status, external_id")
    .eq("id", contactId)
    .single();
  if (!c) return null;
  if (c.status === "unsubscribed") return c;

  const now = new Date().toISOString();
  await db.from("contacts").update({ status: "unsubscribed", unsubscribed_at: now }).eq("id", c.id);
  await db.from("list_members").update({ status: "unsubscribed" }).eq("contact_id", c.id);
  await db.from("suppressions").upsert({ workspace_id: c.workspace_id, email: c.email, reason: "unsubscribe" });
  await db.from("events").insert({
    workspace_id: c.workspace_id,
    contact_id: c.id,
    message_id: messageId ?? null,
    type: "unsubscribe",
    data: { source },
  });
  // Drop anything still queued for them.
  await db
    .from("messages")
    .update({ status: "suppressed", last_error: "unsubscribed" })
    .eq("contact_id", c.id)
    .eq("kind", "campaign")
    .eq("status", "queued");
  await emit(c.workspace_id, "contact.unsubscribed", {
    contact_id: c.id,
    email: c.email,
    external_id: c.external_id,
    source,
  });
  return c;
}

export async function unsubscribeByToken(token: string, source: string) {
  const { data } = await admin().from("contacts").select("id").eq("unsub_token", token).maybeSingle();
  if (!data) return null;
  return unsubscribeContact(data.id, source);
}

/** Suppress after a hard bounce or complaint. Global so no other tenant hits it either. */
export async function suppressAddress(
  workspaceId: string,
  email: string,
  kind: "bounce" | "complaint",
) {
  const db = admin();
  await db.from("suppressions").upsert({ workspace_id: workspaceId, email, reason: kind });
  await db
    .from("global_suppressions")
    .upsert({ email, reason: kind === "bounce" ? "hard_bounce" : "complaint" }, { ignoreDuplicates: true });
  await db
    .from("contacts")
    .update({ status: kind === "bounce" ? "bounced" : "complained" })
    .eq("workspace_id", workspaceId)
    .eq("email", email);
  await db
    .from("messages")
    .update({ status: "suppressed", last_error: kind })
    .eq("to_email", email)
    .eq("status", "queued");
}

// Auto-pause thresholds (30-day window). SES itself reviews accounts at ~5% / 0.1%.
const MIN_SAMPLE = 100;
const MAX_BOUNCE_RATE = 0.04;
const MAX_COMPLAINT_RATE = 0.0008;

export async function checkReputation(workspaceId: string) {
  const db = admin();
  const { data } = await db.rpc("workspace_reputation", { ws: workspaceId }).single<{
    sent: number;
    bounces: number;
    complaints: number;
  }>();
  if (!data || data.sent < MIN_SAMPLE) return;
  const bounceRate = data.bounces / data.sent;
  const complaintRate = data.complaints / data.sent;
  let reason: string | null = null;
  if (bounceRate > MAX_BOUNCE_RATE) reason = `Bounce rate ${(bounceRate * 100).toFixed(1)}% over 30 days`;
  else if (complaintRate > MAX_COMPLAINT_RATE) reason = `Complaint rate ${(complaintRate * 100).toFixed(2)}% over 30 days`;
  if (!reason) return;

  const { data: updated } = await db
    .from("workspaces")
    .update({ status: "paused", status_reason: reason })
    .eq("id", workspaceId)
    .eq("status", "active")
    .select("id");
  if (updated?.length) await emit(workspaceId, "workspace.paused", { reason });
}
