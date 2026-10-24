import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { assertContactCapacity, formatAddress, getWorkspace, remainingSends, resolveFrom, type Workspace } from "@/lib/workspace";

export type SignupForm = {
  id: string;
  workspace_id: string;
  list_id: string | null;
  name: string;
  public_key: string;
  allowed_origins: string[];
  tags: string[];
  double_opt_in: boolean;
  redirect_url: string | null;
  enabled: boolean;
};

const FORM_COLS = "id, workspace_id, list_id, name, public_key, allowed_origins, tags, double_opt_in, redirect_url, enabled";

/** Max submissions per IP per form per hour. */
const HITS_PER_HOUR = 8;
/** Don't resend a confirmation to the same contact more often than this. */
const RESEND_AFTER_MS = 10 * 60_000;

const str = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const formSubmission = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  first_name: str(100),
  last_name: str(100),
  fields: z.record(z.string().max(60), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).optional(),
});
export type FormSubmission = z.infer<typeof formSubmission>;

/** Normalise "lapthelake.com.au/" or "https://www.x.com/path" to an origin. */
export function toOrigin(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.origin.toLowerCase();
  } catch {
    return null;
  }
}

export async function getFormByKey(key: string): Promise<SignupForm | null> {
  if (!/^frm_[a-f0-9]{24}$/.test(key)) return null;
  const { data } = await admin().from("signup_forms").select(FORM_COLS).eq("public_key", key).maybeSingle();
  return (data as SignupForm | null) ?? null;
}

/** Origins the form accepts. A site listed as https://x also allows https://www.x and vice versa. */
export function originAllowed(form: SignupForm, origin: string | null): boolean {
  if (!form.allowed_origins.length) return true;
  if (!origin) return true; // server-to-server or no-referrer posts; still rate limited
  const o = origin.toLowerCase();
  return form.allowed_origins.some((a) => {
    const base = a.toLowerCase();
    return o === base || o === base.replace("://", "://www.") || o.replace("://www.", "://") === base;
  });
}

export async function rateLimited(form: SignupForm, ip: string): Promise<boolean> {
  const db = admin();
  const ip_hash = createHash("sha256").update(`${form.id}:${ip}`).digest("hex").slice(0, 32);
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await db
    .from("form_hits")
    .select("form_id", { count: "exact", head: true })
    .eq("form_id", form.id)
    .eq("ip_hash", ip_hash)
    .gte("created_at", since);
  if ((count ?? 0) >= HITS_PER_HOUR) return true;
  await db.from("form_hits").insert({ form_id: form.id, ip_hash });
  // Opportunistic cleanup of old hits for this form.
  if (Math.random() < 0.05) await db.from("form_hits").delete().eq("form_id", form.id).lt("created_at", since);
  return false;
}

export type SubmitResult = { status: "subscribed" | "pending" };

/**
 * Add a signup to the workspace. Never reveals whether an address was already
 * on the list, unsubscribed or suppressed: callers always get a normal result.
 */
export async function submitForm(form: SignupForm, input: FormSubmission, origin: string | null): Promise<SubmitResult> {
  const db = admin();
  const ws = await getWorkspace(form.workspace_id);
  const email = input.email;
  const source = `form: ${form.name}${origin ? ` (${origin.replace(/^https?:\/\//, "")})` : ""}`;
  const now = new Date().toISOString();

  await db.rpc("record_form_submission", { p_form_id: form.id });

  // Hard-bounced / complained anywhere: quietly accept and do nothing.
  const { data: g } = await db.from("global_suppressions").select("reason").eq("email", email).maybeSingle();
  if (g) return { status: form.double_opt_in ? "pending" : "subscribed" };

  const { data: prev } = await db
    .from("contacts")
    .select("id, status, tags, fields, first_name, last_name, consent_source, consented_at")
    .eq("workspace_id", ws.id)
    .eq("email", email)
    .maybeSingle();

  if (prev && (prev.status === "bounced" || prev.status === "complained")) {
    return { status: form.double_opt_in ? "pending" : "subscribed" };
  }

  const merged = {
    first_name: input.first_name ?? prev?.first_name ?? null,
    last_name: input.last_name ?? prev?.last_name ?? null,
    fields: { ...(prev?.fields ?? {}), ...(input.fields ?? {}) },
    tags: [...new Set([...(prev?.tags ?? []), ...form.tags])],
  };

  // Already a subscriber of this sender: update details, add to the list.
  if (prev?.status === "subscribed") {
    await db.from("contacts").update(merged).eq("id", prev.id);
    if (form.list_id) {
      await db
        .from("list_members")
        .upsert({ list_id: form.list_id, contact_id: prev.id, workspace_id: ws.id, status: "subscribed" }, { onConflict: "list_id,contact_id" });
    }
    return { status: "subscribed" };
  }

  // Unsubscribed people always confirm by email, even on single opt-in forms,
  // so nobody can resubscribe someone else.
  const needsConfirm = form.double_opt_in || prev?.status === "unsubscribed";

  if (!prev) await assertContactCapacity(ws, 1);

  if (!needsConfirm) {
    const { data: c, error } = await db
      .from("contacts")
      .upsert(
        { workspace_id: ws.id, email, ...merged, status: "subscribed", consent_source: source, consented_at: now, unsubscribed_at: null },
        { onConflict: "workspace_id,email" },
      )
      .select("id")
      .single();
    if (error || !c) throw new Error(error?.message ?? "Could not save contact");
    if (form.list_id) {
      await db
        .from("list_members")
        .upsert({ list_id: form.list_id, contact_id: c.id, workspace_id: ws.id, status: "subscribed" }, { onConflict: "list_id,contact_id" });
    }
    return { status: "subscribed" };
  }

  // Double opt-in: save as pending (or leave unsubscribed) until they click the link.
  const { data: c, error } = await db
    .from("contacts")
    .upsert(
      { workspace_id: ws.id, email, ...merged, status: prev?.status ?? "pending" },
      { onConflict: "workspace_id,email" },
    )
    .select("id")
    .single();
  if (error || !c) throw new Error(error?.message ?? "Could not save contact");
  if (form.list_id) {
    await db
      .from("list_members")
      .upsert({ list_id: form.list_id, contact_id: c.id, workspace_id: ws.id, status: "pending" }, { onConflict: "list_id,contact_id", ignoreDuplicates: true });
  }

  const { data: recent } = await db
    .from("form_confirmations")
    .select("created_at")
    .eq("contact_id", c.id)
    .is("confirmed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent && Date.now() - new Date(recent.created_at).getTime() < RESEND_AFTER_MS) return { status: "pending" };

  const { data: conf, error: cErr } = await db
    .from("form_confirmations")
    .insert({ workspace_id: ws.id, form_id: form.id, contact_id: c.id, list_id: form.list_id, consent_source: source })
    .select("token")
    .single();
  if (cErr || !conf) throw new Error(cErr?.message ?? "Could not create confirmation");

  await queueConfirmation(ws, form, c.id, email, input.first_name ?? prev?.first_name ?? null, conf.token);
  return { status: "pending" };
}

async function queueConfirmation(ws: Workspace, form: SignupForm, contactId: string, email: string, firstName: string | null, token: string) {
  if (ws.status !== "active" || (await remainingSends(ws)) < 1) {
    console.warn(`signup form ${form.id}: confirmation not sent (workspace ${ws.status} or out of sends)`);
    return;
  }
  const db = admin();
  let list: { name: string; from_name: string | null; from_email: string | null } | null = null;
  if (form.list_id) {
    const { data } = await db.from("lists").select("name, from_name, from_email").eq("id", form.list_id).maybeSingle();
    list = data ?? null;
  }
  const senderName = list?.from_name || ws.name;
  const what = list?.name && list.name !== senderName ? `${senderName} (${list.name})` : senderName;
  const link = `${env.appUrl}/confirm/${token}`;

  // Send as the list's default sender when it has one; otherwise from the shared domain.
  const shared = `${ws.slug}@${env.sharedSendingDomain}`;
  const { from, replyTo } = list?.from_email
    ? await resolveFrom(ws, senderName, list.from_email)
    : { from: formatAddress(senderName, shared), replyTo: undefined };

  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  const hi = firstName ? `Hi ${esc(firstName)},` : "Hi,";
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px">
<tr><td style="padding:32px">
<p style="margin:0 0 16px;font-size:16px">${hi}</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5">Please confirm you'd like to get emails from <strong>${esc(what)}</strong>.</p>
<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 26px;border-radius:8px;font-size:16px">Confirm my subscription</a></p>
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5">If you didn't sign up, ignore this email and you won't hear from us.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `${hi}\n\nPlease confirm you'd like to get emails from ${what}:\n${link}\n\nIf you didn't sign up, ignore this email and you won't hear from us.`;

  await db.from("messages").insert({
    workspace_id: ws.id,
    contact_id: contactId,
    kind: "transactional",
    to_email: email,
    from_header: from,
    reply_to: replyTo ?? null,
    subject: `Confirm your subscription to ${what}`,
    html,
    text,
  });
}

/** Look up a pending confirmation for the confirm page. */
export async function getConfirmation(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const { data } = await admin()
    .from("form_confirmations")
    .select("token, confirmed_at, workspace_id, contact:contacts(email), workspace:workspaces(name), form:signup_forms(redirect_url)")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  return data as unknown as {
    token: string;
    confirmed_at: string | null;
    workspace_id: string;
    contact: { email: string } | null;
    workspace: { name: string } | null;
    form: { redirect_url: string | null } | null;
  };
}

/** Mark a confirmation as done and subscribe the contact. Links last 7 days. */
export async function confirmSubscription(token: string): Promise<"ok" | "expired" | "invalid"> {
  if (!/^[a-f0-9]{48}$/.test(token)) return "invalid";
  const db = admin();
  const { data: conf } = await db
    .from("form_confirmations")
    .select("token, contact_id, list_id, consent_source, created_at, confirmed_at")
    .eq("token", token)
    .maybeSingle();
  if (!conf) return "invalid";
  if (conf.confirmed_at) return "ok";
  if (Date.now() - new Date(conf.created_at).getTime() > 7 * 86_400_000) return "expired";

  const { data: c } = await db.from("contacts").select("id, status").eq("id", conf.contact_id).maybeSingle();
  if (!c) return "invalid";
  if (c.status === "bounced" || c.status === "complained") return "ok"; // never resubscribe these

  const now = new Date().toISOString();
  await db
    .from("contacts")
    .update({ status: "subscribed", consent_source: conf.consent_source, consented_at: now, unsubscribed_at: null })
    .eq("id", c.id);
  if (conf.list_id) {
    await db.from("list_members").update({ status: "subscribed" }).eq("list_id", conf.list_id).eq("contact_id", c.id);
  }
  await db.from("form_confirmations").update({ confirmed_at: now }).eq("token", token);
  return "ok";
}

