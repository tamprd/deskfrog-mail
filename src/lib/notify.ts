import "server-only";
import { admin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Where account notifications go: the contact email, else the owner's login. */
async function recipient(workspaceId: string, contactEmail: string | null) {
  if (contactEmail) return contactEmail;
  const { data: m } = await admin().from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("role", "owner").limit(1).maybeSingle();
  if (!m) return null;
  return (await admin().auth.admin.getUserById(m.user_id)).data.user?.email ?? null;
}

async function send(to: string, subject: string, heading: string, bodyHtml: string, bodyText: string, cta?: [string, string]) {
  const { sendEmail } = await import("@/lib/ses");
  await sendEmail({
    from: `"Desk Frog Mail" <noreply@${env.sharedSendingDomain}>`,
    to,
    subject,
    text: `${bodyText}${cta ? `\n\n${cta[0]}: ${cta[1]}` : ""}\n\nChange which emails you get: ${env.appUrl}/app/settings/notifications`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937">
<h2 style="color:#0f5132;margin:0 0 12px">${esc(heading)}</h2>${bodyHtml}
${cta ? `<p style="margin:24px 0"><a href="${cta[1]}" style="background:#15803d;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(cta[0])}</a></p>` : ""}
<p style="color:#6b7280;font-size:12px;margin-top:32px">You can change which emails you get in <a href="${env.appUrl}/app/settings/notifications" style="color:#0f5132">notification settings</a>.</p></div>`,
    tags: { kind: "system" },
  });
}

/** 24-hour campaign reports and weekly draft reminders. Cheap to call every minute. */
export async function runNotifications() {
  const db = admin();
  const now = Date.now();
  let sent = 0;

  // 1. Campaign report, 24 hours after it finished.
  const { data: done } = await db
    .from("campaigns")
    .select("id, name, workspace_id, completed_at, workspace:workspaces(notify, contact_email)")
    .eq("status", "sent")
    .is("report_sent_at", null)
    .lt("completed_at", new Date(now - 24 * 3_600_000).toISOString())
    .gt("completed_at", new Date(now - 72 * 3_600_000).toISOString())
    .limit(10);
  for (const c of done ?? []) {
    await db.from("campaigns").update({ report_sent_at: new Date().toISOString() }).eq("id", c.id);
    const w = c.workspace as unknown as { notify: Record<string, boolean>; contact_email: string | null };
    if (w?.notify?.campaign_sent === false) continue;
    const to = await recipient(c.workspace_id, w?.contact_email ?? null);
    if (!to) continue;
    const { data: s } = await db.rpc("campaign_stats", { cid: c.id }).single<Record<string, number>>();
    if (!s) continue;
    const pct = (n: number) => (s.sent ? `${Math.round((n / s.sent) * 1000) / 10}%` : "0%");
    const rows: [string, string][] = [
      ["Sent", String(s.sent)],
      ["Delivered", String(s.delivered)],
      ["Opened", `${s.opened} (${pct(s.opened)})`],
      ["Clicked", `${s.clicked} (${pct(s.clicked)})`],
      ["Bounced", String(s.bounced)],
      ["Unsubscribed", String(s.unsubscribed)],
    ];
    await send(
      to,
      `Report: ${c.name}`,
      `${c.name}: your 24-hour report`,
      `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e5e7eb">${k}</td><td style="padding:6px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:bold">${v}</td></tr>`).join("")}</table>`,
      rows.map(([k, v]) => `${k}: ${v}`).join("\n"),
      ["View full report", `${env.appUrl}/app/campaigns/${c.id}`],
    ).catch(() => {});
    sent++;
  }

  // 2. Weekly nudge about drafts untouched for 7–21 days.
  const { data: stale } = await db
    .from("campaigns")
    .select("workspace_id, name, id")
    .eq("status", "draft")
    .lt("updated_at", new Date(now - 7 * 86_400_000).toISOString())
    .gt("updated_at", new Date(now - 21 * 86_400_000).toISOString())
    .limit(200);
  const byWs = new Map<string, { name: string; id: string }[]>();
  for (const d of stale ?? []) byWs.set(d.workspace_id, [...(byWs.get(d.workspace_id) ?? []), d]);
  for (const [wsId, drafts] of byWs) {
    const { data: w } = await db.from("workspaces").select("notify, contact_email, draft_nudged_at").eq("id", wsId).single();
    if (!w || w.notify?.draft_reminder === false) continue;
    if (w.draft_nudged_at && now - new Date(w.draft_nudged_at).getTime() < 7 * 86_400_000) continue;
    await db.from("workspaces").update({ draft_nudged_at: new Date().toISOString() }).eq("id", wsId);
    const to = await recipient(wsId, w.contact_email);
    if (!to) continue;
    await send(
      to,
      drafts.length === 1 ? `Still working on "${drafts[0].name}"?` : `You have ${drafts.length} unfinished drafts`,
      "Pick up where you left off",
      `<ul>${drafts.slice(0, 5).map((d) => `<li><a href="${env.appUrl}/editor/${d.id}" style="color:#0f5132">${esc(d.name)}</a></li>`).join("")}</ul>`,
      drafts.slice(0, 5).map((d) => `- ${d.name}: ${env.appUrl}/editor/${d.id}`).join("\n"),
      ["Open campaigns", `${env.appUrl}/app/campaigns`],
    ).catch(() => {});
    sent++;
  }
  return { sent };
}
