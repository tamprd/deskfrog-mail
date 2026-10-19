import "server-only";
import { admin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { isTransient, sendEmail } from "@/lib/ses";
import { BADGE_HTML, footerHtml, footerText, htmlToText, merge, oneClickUrl, withFooter, type MergeContact } from "@/lib/render";
import { emit } from "@/lib/webhooks";
import { getWorkspace, type Workspace } from "@/lib/workspace";

type Message = {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  contact_id: string | null;
  kind: "campaign" | "transactional";
  to_email: string;
  from_header: string;
  reply_to: string | null;
  subject: string;
  html: string | null;
  text: string | null;
  headers: Record<string, string>;
  attempts: number;
};

type Campaign = { id: string; html: string; text: string | null; subject: string; from_name: string; format: "design" | "html" | "text" };
type Contact = MergeContact & { id: string; status: string };

const MAX_ATTEMPTS = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drain the queue for up to `budgetMs`. Safe to run concurrently: rows are claimed
 * with FOR UPDATE SKIP LOCKED.
 */
export async function processQueue(budgetMs = 50_000) {
  const db = admin();
  const deadline = Date.now() + budgetMs;
  const perSecond = Math.max(1, env.sesMaxPerSecond);
  const workspaces = new Map<string, Workspace>();
  const campaigns = new Map<string, Campaign>();
  let sent = 0;
  let failed = 0;
  let suppressed = 0;

  while (Date.now() < deadline) {
    const { data: batch, error } = await db.rpc("claim_messages", { batch_size: perSecond });
    if (error) throw new Error(error.message);
    if (!batch?.length) break;
    const tick = Date.now();

    const contactIds = [...new Set((batch as Message[]).map((m) => m.contact_id).filter(Boolean))] as string[];
    const { data: contactRows } = contactIds.length
      ? await db
          .from("contacts")
          .select("id, email, first_name, last_name, fields, unsub_token, status")
          .in("id", contactIds)
      : { data: [] };
    const contacts = new Map((contactRows ?? []).map((c) => [c.id, c as Contact]));

    const emails = (batch as Message[]).map((m) => m.to_email);
    const { data: globalRows } = await db.from("global_suppressions").select("email").in("email", emails);
    const globallySuppressed = new Set((globalRows ?? []).map((r) => r.email.toLowerCase()));

    const sentPerWorkspace = new Map<string, number>();

    await Promise.all(
      (batch as Message[]).map(async (m) => {
        try {
          let ws = workspaces.get(m.workspace_id);
          if (!ws) {
            ws = await getWorkspace(m.workspace_id);
            workspaces.set(ws.id, ws);
          }
          const contact = m.contact_id ? contacts.get(m.contact_id) : undefined;

          // Last-chance suppression checks (state may have changed since enqueue).
          const blocked =
            globallySuppressed.has(m.to_email.toLowerCase()) ||
            (m.kind === "campaign" && (!contact || contact.status !== "subscribed"));
          if (blocked) {
            suppressed++;
            await db.from("messages").update({ status: "suppressed", last_error: "suppressed at send" }).eq("id", m.id);
            return;
          }

          const out = await build(m, ws, contact, campaigns);
          const sesId = await sendEmail({
            from: m.from_header,
            to: m.to_email,
            replyTo: m.reply_to,
            subject: out.subject,
            html: out.html,
            text: out.text,
            headers: { ...m.headers, ...out.headers },
            tags: { workspace: ws.id, message: m.id, kind: m.kind },
          });

          await db
            .from("messages")
            .update({ status: "sent", ses_message_id: sesId, sent_at: new Date().toISOString(), last_error: null })
            .eq("id", m.id);
          await db.from("events").insert({ workspace_id: ws.id, message_id: m.id, contact_id: m.contact_id, type: "sent" });
          sentPerWorkspace.set(ws.id, (sentPerWorkspace.get(ws.id) ?? 0) + 1);
          sent++;
          await emit(ws.id, "email.sent", { message_id: m.id, campaign_id: m.campaign_id, to: m.to_email });
        } catch (err) {
          const retry = isTransient(err) && m.attempts < MAX_ATTEMPTS;
          const msg = (err as Error).message?.slice(0, 500) ?? "send failed";
          if (retry) {
            const backoff = 2 ** m.attempts * 30_000;
            await db
              .from("messages")
              .update({ status: "queued", last_error: msg, send_after: new Date(Date.now() + backoff).toISOString() })
              .eq("id", m.id);
          } else {
            failed++;
            await db.from("messages").update({ status: "failed", last_error: msg }).eq("id", m.id);
            await db
              .from("events")
              .insert({ workspace_id: m.workspace_id, message_id: m.id, contact_id: m.contact_id, type: "failed", data: { error: msg } });
            await emit(m.workspace_id, "email.failed", { message_id: m.id, to: m.to_email, error: msg });
          }
        }
      }),
    );

    for (const [wsId, n] of sentPerWorkspace) {
      await db.rpc("record_sends", { ws: wsId, n });
    }

    // Stay under the account's SES send rate.
    const elapsed = Date.now() - tick;
    if (elapsed < 1000) await sleep(1000 - elapsed);
  }

  await db.rpc("complete_campaigns");
  await recoverStuck();
  return { sent, failed, suppressed };
}

/** Messages left in 'sending' by a crashed worker go back to the queue after 10 minutes. */
async function recoverStuck() {
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  await admin()
    .from("messages")
    .update({ status: "queued" })
    .eq("status", "sending")
    .is("ses_message_id", null)
    .lt("send_after", cutoff);
}

async function build(m: Message, ws: Workspace, contact: Contact | undefined, cache: Map<string, Campaign>) {
  const badge = ws.plan.badge_required;
  const headers: Record<string, string> = {};

  if (m.kind === "campaign" && m.campaign_id && contact) {
    let c = cache.get(m.campaign_id);
    if (!c) {
      const { data } = await admin()
        .from("campaigns")
        .select("id, html, text, subject, from_name, format")
        .eq("id", m.campaign_id)
        .single();
      c = data as Campaign;
      cache.set(c.id, c);
    }
    const token = contact.unsub_token!;
    const footerOpts = { senderName: c.from_name || ws.name, senderAddress: ws.sender_address, unsubToken: token, badge };
    // Plain-text campaigns go out with no HTML part at all.
    const html = c.format === "text" ? null : withFooter(merge(c.html, contact), footerHtml(footerOpts));
    const text = (c.text ? merge(c.text, contact, true) : htmlToText(merge(c.html, contact, true))) + footerText(footerOpts);
    // RFC 8058 one-click unsubscribe — required by Gmail/Yahoo for bulk senders.
    headers["List-Unsubscribe"] = `<${oneClickUrl(token)}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    return { subject: merge(c.subject, contact, true), html, text, headers };
  }

  // Transactional: content was rendered at request time.
  const html = m.html ? (badge ? withFooter(m.html, BADGE_HTML) : m.html) : null;
  const text = (m.text ?? (m.html ? htmlToText(m.html) : "")) + (badge ? "\n\nSent with Desk Frog Mail — https://mail.deskfrog.studio" : "");
  return { subject: m.subject, html, text, headers };
}
