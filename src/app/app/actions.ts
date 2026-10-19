"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { ApiError, generateApiKey } from "@/lib/api";
import { enqueueCampaign } from "@/lib/campaigns";
import { assertContactCapacity } from "@/lib/workspace";
import { newWebhookSecret, WEBHOOK_EVENTS } from "@/lib/webhooks";

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
  const { workspace } = await requireSession();
  const f = (k: string) => String(formData.get(k) ?? "").trim();
  const html = f("html").includes("<") ? f("html") : `<p>${f("html").replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
  const row = {
    workspace_id: workspace.id,
    name: f("name"),
    subject: f("subject"),
    from_name: f("from_name"),
    from_email: f("from_email").toLowerCase(),
    list_id: f("list_id") || null,
    tag_filter: f("tags").split(",").map((t) => t.trim()).filter(Boolean),
    html,
  };
  if (!row.name || !row.subject || !row.from_name || !row.from_email || !f("html")) return { error: "Fill in every field." };
  const { data, error } = await admin().from("campaigns").insert(row).select("id").single();
  if (error) return { error: error.message };
  redirect(`/app/campaigns/${data.id}`);
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
