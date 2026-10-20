import "server-only";
import { admin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export type Sender = { email: string; name: string | null; source: "login" | "verified" | "domain" };

/** Addresses this workspace may use as From / Reply-to: the signed-in user's email, verified sender addresses, and anything at a verified domain. */
export async function allowedSenders(workspaceId: string, userEmail?: string | null) {
  const db = admin();
  const [{ data: senders }, { data: domains }] = await Promise.all([
    db.from("sender_addresses").select("email, name").eq("workspace_id", workspaceId).not("verified_at", "is", null).order("created_at"),
    db.from("sending_domains").select("domain").eq("workspace_id", workspaceId).eq("status", "verified"),
  ]);
  const list: Sender[] = [];
  if (userEmail) list.push({ email: userEmail.toLowerCase(), name: null, source: "login" });
  for (const s of senders ?? []) if (!list.some((x) => x.email === s.email)) list.push({ email: s.email, name: s.name, source: "verified" });
  return { senders: list, domains: (domains ?? []).map((d) => d.domain as string) };
}

export async function isAllowedSender(workspaceId: string, email: string, userEmail?: string | null) {
  const e = email.trim().toLowerCase();
  const { senders, domains } = await allowedSenders(workspaceId, userEmail);
  return senders.some((s) => s.email === e) || domains.includes(e.split("@")[1] ?? "");
}

/** Email the verification link. */
export async function sendSenderVerification(opts: { token: string; email: string; workspaceName: string }) {
  const { sendEmail } = await import("@/lib/ses");
  const link = `${env.appUrl}/verify-sender/${opts.token}`;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  await sendEmail({
    from: `"Desk Frog Mail" <noreply@${env.sharedSendingDomain}>`,
    to: opts.email,
    subject: `Confirm ${opts.email} for ${opts.workspaceName}`,
    text: `${opts.workspaceName} wants to send emails using ${opts.email} on Desk Frog Mail.\n\nConfirm it's yours: ${link}\n\nIf you didn't ask for this, ignore this email and nothing will happen.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2937">
<h2 style="color:#0f5132;margin:0 0 12px">Confirm your sender address</h2>
<p><strong>${esc(opts.workspaceName)}</strong> wants to send emails using <strong>${esc(opts.email)}</strong> on Desk Frog Mail.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#15803d;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Confirm this address</a></p>
<p style="color:#6b7280;font-size:13px">If you didn't ask for this, ignore this email and nothing will happen.</p></div>`,
    tags: { kind: "system" },
  });
}
