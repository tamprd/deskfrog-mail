"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { ApiError, generateApiKey } from "@/lib/api";
import { enqueueCampaign } from "@/lib/campaigns";
import { assertContactCapacity } from "@/lib/workspace";
import { newWebhookSecret, WEBHOOK_EVENTS } from "@/lib/webhooks";
import { DEFAULT_BRAND, FONTS, isDesign, type Brand, type Design } from "@/lib/email/design";
import { renderDesign } from "@/lib/email/render";
import { getStarter } from "@/lib/email/templates";

const msg = (e: unknown) => (e instanceof ApiError ? e.message : (e as Error).message ?? "Something went wrong");

export async function signOut() {
  const { supabase } = await requireSession();
  await supabase.auth.signOut();
  redirect("/login");
}

// ── Audience ─────────────────────────────────────────────

/** Paste "email, first name, last name" lines. Consent must be confirmed. */
export async function importContacts(_prev: unknown, formData: FormData) {
  const { workspace } = await requireSession();
  if (formData.get("consent") !== "on") return { error: "Confirm these people agreed to receive your emails." };
  const listId = String(formData.get("list_id") || "") || null;
  const tags = String(formData.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean);
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const rows = String(formData.get("rows") || "")
    .split(/\r?\n/)
    .map((l) => l.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, "")))
    .filter((c) => c[0] && re.test(c[0]))
    .map(([email, first, last]) => ({ email: email.toLowerCase(), first_name: first || null, last_name: last || null }));
  const unique = [...new Map(rows.map((r) => [r.email, r])).values()];
  if (!unique.length) return { error: "No valid email addresses found." };
  if (unique.length > 5000) return { error: "Import up to 5,000 at a time." };

  const db = admin();
  try {
    const { data: existing } = await db.from("contacts").select("email").eq("workspace_id", workspace.id).in("email", unique.map((r) => r.email));
    const have = new Set((existing ?? []).map((e) => e.email.toLowerCase()));
    const fresh = unique.filter((r) => !have.has(r.email));
    await assertContactCapacity(workspace, fresh.length);

    const { data: blocked } = await db.from("global_suppressions").select("email").in("email", fresh.map((r) => r.email));
    const blockedSet = new Set((blocked ?? []).map((b) => b.email.toLowerCase()));
    const now = new Date().toISOString();
    if (fresh.length) {
      const { error } = await db.from("contacts").insert(
        fresh.map((r) => ({
          ...r,
          workspace_id: workspace.id,
          tags,
          status: blockedSet.has(r.email) ? "bounced" : "subscribed",
          consent_source: "dashboard_import",
          consented_at: now,
        })),
      );
      if (error) throw new Error(error.message);
    }
    if (listId) {
      const { data: ids } = await db.from("contacts").select("id").eq("workspace_id", workspace.id).in("email", unique.map((r) => r.email));
      await db.from("list_members").upsert(
        (ids ?? []).map((c) => ({ list_id: listId, contact_id: c.id, workspace_id: workspace.id })),
        { onConflict: "list_id,contact_id", ignoreDuplicates: true },
      );
    }
    revalidatePath("/app/contacts");
    return { ok: `Added ${fresh.length} new contact${fresh.length === 1 ? "" : "s"}${unique.length - fresh.length ? `, ${unique.length - fresh.length} already existed` : ""}.` };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function createList(formData: FormData) {
  const { workspace } = await requireSession();
  const name = String(formData.get("name") || "").trim();
  if (name) await admin().from("lists").insert({ workspace_id: workspace.id, name });
  revalidatePath("/app/contacts");
}

export async function unsubscribeFromDashboard(formData: FormData) {
  const { workspace } = await requireSession();
  const id = String(formData.get("id"));
  const { data } = await admin().from("contacts").select("id").eq("id", id).eq("workspace_id", workspace.id).maybeSingle();
  if (data) {
    const { unsubscribeContact } = await import("@/lib/suppress");
    await unsubscribeContact(id, "dashboard");
  }
  revalidatePath("/app/contacts");
}

// ── Campaigns ────────────────────────────────────────────

export async function createCampaign(_prev: unknown, formData: FormData) {
  const { workspace, user } = await requireSession();
  const f = (k: string) => String(formData.get(k) ?? "").trim();
  const { data: ws } = await admin().from("workspaces").select("brand").eq("id", workspace.id).single();
  const brand = (ws?.brand ?? {}) as Partial<Brand>;
  // template is "starter:<id>", "saved:<uuid>", or a bare starter id
  const choice = f("template") || "starter:blank";
  let design: Design = getStarter(choice.replace(/^starter:/, "")).build(brand);
  let html: string | null = null;
  if (choice.startsWith("saved:")) {
    const { data: t } = await admin()
      .from("templates")
      .select("design, html")
      .eq("id", choice.slice(6))
      .eq("workspace_id", workspace.id)
      .maybeSingle();
    if (!t) return { error: "That template no longer exists." };
    if (isDesign(t.design)) design = t.design;
    else {
      design = { ...design, blocks: [{ id: "legacy", type: "html", html: t.html }] };
      html = t.html;
    }
  }
  if (!f("name") || !f("from_name") || !f("from_email")) return { error: "Fill in the campaign name and sender details." };
  {
    const { isAllowedSender } = await import("@/lib/senders");
    if (!(await isAllowedSender(workspace.id, f("from_email"), user.email))) {
      return { error: "Verify that email address first (Settings → Sender addresses)." };
    }
  }
  let subject = f("subject");
  // How the content is authored: template (default) | blank | html | text | ai
  const mode = f("mode") || "template";
  let format: "design" | "html" | "text" = "design";
  let text: string | null = null;

  if (mode === "blank") {
    design = getStarter("blank").build(brand);
    html = null;
  } else if (mode === "html") {
    const pasted = String(formData.get("html_paste") ?? "");
    if (!pasted.trim()) return { error: "Paste your HTML first." };
    if (pasted.length > 500_000) return { error: "That HTML is too large (500 KB max)." };
    format = "html";
    html = pasted;
    if (!subject) subject = /<title>([^<]{1,200})<\/title>/i.exec(pasted)?.[1]?.trim() ?? "";
  } else if (mode === "text") {
    format = "text";
    text = String(formData.get("plain_text") ?? "").slice(0, 200_000);
    html = "";
  } else if (mode === "ai") {
    const brief = f("ai_brief").slice(0, 3000);
    if (!brief) return { error: "Describe the email for the AI to write." };
    try {
      const { generateDesign } = await import("@/lib/ai/claude");
      const { withCredit } = await import("@/lib/ai/credits");
      const ai = await withCredit(workspace.id, workspace.plan.id, () =>
        generateDesign({ brief, tone: f("ai_tone") || "friendly", senderName: f("from_name"), brand }),
      );
      design = ai.design;
      html = null;
      if (!subject) subject = ai.subject;
    } catch (e) {
      return { error: (e as Error).message || "The AI couldn't write that email. Try again." };
    }
  }
  const row = {
    workspace_id: workspace.id,
    name: f("name"),
    subject,
    from_name: f("from_name"),
    from_email: f("from_email").toLowerCase(),
    list_id: f("list_id") || null,
    tag_filter: f("tags").split(",").map((t) => t.trim()).filter(Boolean),
    format,
    text,
    design: format === "design" ? design : null,
    html: format === "design" ? html ?? (await renderDesign(design, brand)) : html ?? "",
  };
  if (!row.subject) return { error: "Add a subject line." };
  const { data, error } = await admin().from("campaigns").insert(row).select("id").single();
  if (error) return { error: error.message };
  redirect(`/editor/${data.id}`);
}

/** Copy a campaign (any status) into a new draft. */
export async function duplicateCampaign(formData: FormData) {
  const { workspace } = await requireSession();
  const db = admin();
  const { data: c } = await db
    .from("campaigns")
    .select("name, subject, from_name, from_email, reply_to, html, text, design, list_id, tag_filter")
    .eq("id", String(formData.get("id")))
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (!c) return;
  const { data } = await db.from("campaigns").insert({ ...c, name: `${c.name} (copy)`, workspace_id: workspace.id }).select("id").single();
  if (data) redirect(`/editor/${data.id}`);
}

export async function deleteTemplate(formData: FormData) {
  const { workspace } = await requireSession();
  await admin().from("templates").delete().eq("id", String(formData.get("id"))).eq("workspace_id", workspace.id);
  revalidatePath("/app/templates");
}

// ── Brand kit ────────────────────────────────────────────

export async function saveBrand(_prev: unknown, formData: FormData) {
  const { workspace, role } = await requireSession();
  if (!["owner", "admin"].includes(role)) return { error: "Only admins can change the brand." };
  const hex = (k: string, fallback: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : fallback;
  };
  const db = admin();
  const { data: ws } = await db.from("workspaces").select("brand").eq("id", workspace.id).single();
  const prev = { ...DEFAULT_BRAND, ...((ws?.brand ?? {}) as Partial<Brand>) };
  let logoUrl = prev.logoUrl;

  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    const ext: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
    if (!ext[file.type]) return { error: "Logo must be PNG, JPG, GIF or WebP." };
    if (file.size > 2 * 1024 * 1024) return { error: "Logo must be under 2 MB." };
    const path = `${workspace.id}/logo-${Date.now()}.${ext[file.type]}`;
    const { error } = await db.storage.from("email-assets").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: "31536000" });
    if (error) return { error: error.message };
    logoUrl = db.storage.from("email-assets").getPublicUrl(path).data.publicUrl;
  }
  if (formData.get("remove_logo") === "on") logoUrl = undefined;

  const font = String(formData.get("font") ?? prev.font);
  const brand: Brand = {
    logoUrl,
    primary: hex("primary", prev.primary),
    text: hex("text", prev.text),
    background: hex("background", prev.background),
    content: hex("content", prev.content),
    font: font in FONTS ? font : prev.font,
  };
  const { error } = await db.from("workspaces").update({ brand }).eq("id", workspace.id);
  if (error) return { error: error.message };
  revalidatePath("/app/settings");
  return { ok: "Brand saved. New emails will use it." };
}

export async function sendCampaign(_prev: unknown, formData: FormData) {
  const { workspace } = await requireSession();
  try {
    const { recipients } = await enqueueCampaign(String(formData.get("id")), workspace.id);
    revalidatePath("/app/campaigns");
    return { ok: recipients ? `Queued for ${recipients} recipient${recipients === 1 ? "" : "s"}. 🐸` : "No eligible recipients." };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function deleteDraft(formData: FormData) {
  const { workspace } = await requireSession();
  await admin().from("campaigns").delete().eq("id", String(formData.get("id"))).eq("workspace_id", workspace.id).eq("status", "draft");
  redirect("/app/campaigns");
}

// ── Settings ─────────────────────────────────────────────

export async function updateWorkspace(formData: FormData) {
  const { workspace, role } = await requireSession();
  if (!["owner", "admin"].includes(role)) return;
  await admin()
    .from("workspaces")
    .update({
      name: String(formData.get("name") || workspace.name).trim().slice(0, 80),
      sender_address: String(formData.get("sender_address") || "").trim().slice(0, 300) || null,
    })
    .eq("id", workspace.id);
  revalidatePath("/app", "layout");
}

export async function createApiKey(_prev: unknown, formData: FormData) {
  const { workspace, role } = await requireSession();
  if (!["owner", "admin"].includes(role)) return { error: "Only admins can create keys." };
  const name = String(formData.get("name") || "API key").trim().slice(0, 60);
  const { key, prefix, hash } = generateApiKey();
  const { error } = await admin().from("api_keys").insert({ workspace_id: workspace.id, name, prefix, key_hash: hash });
  if (error) return { error: error.message };
  revalidatePath("/app/settings");
  return { key };
}

export async function revokeApiKey(formData: FormData) {
  const { workspace, role } = await requireSession();
  if (!["owner", "admin"].includes(role)) return;
  await admin().from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", String(formData.get("id"))).eq("workspace_id", workspace.id);
  revalidatePath("/app/settings");
}

export async function createWebhook(_prev: unknown, formData: FormData) {
  const { workspace, role } = await requireSession();
  if (!["owner", "admin"].includes(role)) return { error: "Only admins can add webhooks." };
  const url = String(formData.get("url") || "").trim();
  if (!/^https:\/\/[^\s]+$/.test(url)) return { error: "Webhook URL must start with https://" };
  const events = formData.getAll("events").map(String).filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e));
  const secret = newWebhookSecret();
  const { error } = await admin().from("webhook_endpoints").insert({ workspace_id: workspace.id, url, events, secret });
  if (error) return { error: error.message };
  revalidatePath("/app/settings");
  return { secret };
}

export async function deleteWebhook(formData: FormData) {
  const { workspace, role } = await requireSession();
  if (!["owner", "admin"].includes(role)) return;
  await admin().from("webhook_endpoints").delete().eq("id", String(formData.get("id"))).eq("workspace_id", workspace.id);
  revalidatePath("/app/settings");
}

/** New draft that goes only to people who received `id` but didn't open or click it. */
export async function createResend(formData: FormData) {
  const { workspace } = await requireSession();
  const db = admin();
  const id = String(formData.get("id"));
  const { data: c } = await db
    .from("campaigns")
    .select("id, name, subject, from_name, from_email, reply_to, html, text, design, format, list_id, tag_filter, status")
    .eq("id", id)
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (!c || c.status === "draft") return;
  const { id: _orig, status: _s, ...copy } = c;
  void _orig; void _s;
  const { data } = await db
    .from("campaigns")
    .insert({ ...copy, name: `Resend: ${c.name}`.slice(0, 120), workspace_id: workspace.id, resend_of: c.id })
    .select("id")
    .single();
  if (data) redirect(`/app/campaigns/${data.id}`);
}

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/;
const sesNotReady = (e: unknown) =>
  /AWS|credential|SES_|region|Missing env/i.test(String((e as Error)?.message ?? e))
    ? "Email sending isn't connected yet (Amazon SES setup). Your domain can be added once that's done."
    : String((e as Error)?.message ?? e);

/** Add a sending domain from Settings; returns the DNS records to add. */
export async function addDomain(_prev: unknown, formData: FormData) {
  const { workspace, role } = await requireSession();
  if (!["owner", "admin"].includes(role)) return { error: "Only admins can add domains." };
  if (!workspace.plan.custom_domain) return { error: "Your own sending domain is available on paid plans." };
  const domain = String(formData.get("domain") || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!DOMAIN_RE.test(domain)) return { error: "Enter a domain like tamperedmotorsport.com.au" };
  if (domain.endsWith("deskfrog.studio")) return { error: "That domain is reserved." };
  const db = admin();
  const { data: taken } = await db.from("sending_domains").select("workspace_id").eq("domain", domain).neq("workspace_id", workspace.id).limit(1);
  if (taken?.length) return { error: "That domain is already used by another workspace." };
  try {
    const { createDomainIdentity } = await import("@/lib/ses");
    const id = await createDomainIdentity(domain);
    const { error } = await db.from("sending_domains").upsert(
      { workspace_id: workspace.id, domain, dns_records: id.records, status: id.verified ? "verified" : "pending", verified_at: id.verified ? new Date().toISOString() : null },
      { onConflict: "workspace_id,domain" },
    );
    if (error) return { error: error.message };
  } catch (e) {
    return { error: sesNotReady(e) };
  }
  revalidatePath("/app/settings");
  return { ok: `${domain} added. Now add the DNS records below.` };
}

/** Re-check DNS verification for a domain. */
export async function checkDomain(formData: FormData) {
  const { workspace } = await requireSession();
  const db = admin();
  const { data: d } = await db.from("sending_domains").select("id, domain").eq("id", String(formData.get("id"))).eq("workspace_id", workspace.id).maybeSingle();
  if (!d) return;
  try {
    const { domainStatus } = await import("@/lib/ses");
    const s = await domainStatus(d.domain);
    await db.from("sending_domains").update({ dns_records: s.records, status: s.verified ? "verified" : s.dkimStatus === "FAILED" ? "failed" : "pending", verified_at: s.verified ? new Date().toISOString() : null }).eq("id", d.id);
  } catch {
    /* SES not reachable; leave as is */
  }
  revalidatePath("/app/settings");
}

export async function removeDomain(formData: FormData) {
  const { workspace, role } = await requireSession();
  if (!["owner", "admin"].includes(role)) return;
  await admin().from("sending_domains").delete().eq("id", String(formData.get("id"))).eq("workspace_id", workspace.id);
  revalidatePath("/app/settings");
}

/** Edit a contact's details, tags, custom fields and list membership from their profile. */
export async function updateContact(_prev: unknown, formData: FormData) {
  const { workspace } = await requireSession();
  const db = admin();
  const id = String(formData.get("id"));
  const { data: c } = await db.from("contacts").select("id, email").eq("id", id).eq("workspace_id", workspace.id).maybeSingle();
  if (!c) return { error: "Contact not found." };

  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  const tags = [...new Set(String(formData.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean))];
  const fields: Record<string, string> = {};
  const keys = formData.getAll("field_key").map(String);
  const vals = formData.getAll("field_value").map(String);
  keys.forEach((raw, i) => {
    const k = raw.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    const v = (vals[i] ?? "").trim();
    if (k && v) fields[k] = v;
  });

  const { error } = await db
    .from("contacts")
    .update({
      email,
      first_name: String(formData.get("first_name") || "").trim() || null,
      last_name: String(formData.get("last_name") || "").trim() || null,
      tags,
      fields,
    })
    .eq("id", id)
    .eq("workspace_id", workspace.id);
  if (error) return { error: error.code === "23505" ? "Another contact already has that email." : error.message };

  // Lists: add ticked, remove unticked (only lists in this workspace).
  const { data: lists } = await db.from("lists").select("id").eq("workspace_id", workspace.id);
  const all = (lists ?? []).map((l) => l.id);
  const want = formData.getAll("lists").map(String).filter((l) => all.includes(l));
  const drop = all.filter((l) => !want.includes(l));
  if (want.length) {
    await db.from("list_members").upsert(want.map((list_id) => ({ list_id, contact_id: id, workspace_id: workspace.id })), { onConflict: "list_id,contact_id", ignoreDuplicates: true });
  }
  if (drop.length) await db.from("list_members").delete().eq("contact_id", id).in("list_id", drop);

  revalidatePath(`/app/contacts/${id}`);
  revalidatePath("/app/contacts");
  return { ok: "Saved." };
}

export async function deleteContact(formData: FormData) {
  const { workspace } = await requireSession();
  await admin().from("contacts").delete().eq("id", String(formData.get("id"))).eq("workspace_id", workspace.id);
  revalidatePath("/app/contacts");
  redirect("/app/contacts");
}

// ── Sender addresses ─────────────────────────────────────

export async function addSender(_prev: unknown, formData: FormData) {
  const { workspace, role } = await requireSession();
  if (!["owner", "admin"].includes(role)) return { error: "Only admins can add sender addresses." };
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim() || null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  const db = admin();
  const { count } = await db.from("sender_addresses").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id);
  if ((count ?? 0) >= 20) return { error: "You can have up to 20 sender addresses." };
  const { data, error } = await db
    .from("sender_addresses")
    .upsert({ workspace_id: workspace.id, email, name }, { onConflict: "workspace_id,email" })
    .select("token, verified_at")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/app/settings");
  if (data.verified_at) return { ok: `${email} is already verified.` };
  try {
    const { sendSenderVerification } = await import("@/lib/senders");
    await sendSenderVerification({ token: data.token, email, workspaceName: workspace.name });
    await db.from("sender_addresses").update({ sent_at: new Date().toISOString() }).eq("workspace_id", workspace.id).eq("email", email);
  } catch {
    return { error: `Saved, but the verification email couldn't be sent yet (email sending isn't connected). Use "Resend" once it is.` };
  }
  return { ok: `Verification email sent to ${email}. Click the link in it to start using this address.` };
}

export async function resendSender(_prev: unknown, formData: FormData) {
  const { workspace } = await requireSession();
  const db = admin();
  const id = String(formData.get("id"));
  const { data: s } = await db.from("sender_addresses").select("email, token, verified_at, sent_at").eq("id", id).eq("workspace_id", workspace.id).maybeSingle();
  if (!s) return { error: "That address was removed." };
  if (s.verified_at) return { ok: "Already verified." };
  if (s.sent_at) {
    const wait = 60 - Math.floor((Date.now() - new Date(s.sent_at).getTime()) / 1000);
    if (wait > 0) return { error: `Just sent. Try again in ${wait}s.` };
  }
  try {
    const { sendSenderVerification } = await import("@/lib/senders");
    await sendSenderVerification({ token: s.token, email: s.email, workspaceName: workspace.name });
    await db.from("sender_addresses").update({ sent_at: new Date().toISOString() }).eq("id", id);
  } catch (e) {
    return { error: `Couldn't send: ${(e as Error).message}` };
  }
  revalidatePath("/app/settings");
  return { ok: `Sent to ${s.email}. Check junk/spam if it's not there in a minute.` };
}

export async function removeSender(formData: FormData) {
  const { workspace, role } = await requireSession();
  if (!["owner", "admin"].includes(role)) return;
  await admin().from("sender_addresses").delete().eq("id", String(formData.get("id"))).eq("workspace_id", workspace.id);
  revalidatePath("/app/settings");
}
