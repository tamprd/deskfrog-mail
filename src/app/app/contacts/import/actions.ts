"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { usage } from "@/lib/workspace";

type Row = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  fields: Record<string, string>;
  tags: string[];
  /** status in this list */
  status: "subscribed" | "unsubscribed" | "cleaned";
  /** status across all lists in the export */
  overall: "subscribed" | "unsubscribed" | "bounced";
  optin_at: string | null;
  changed_at: string | null;
};

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Check plan capacity and create (or reuse) the lists. Returns list ids keyed by the export's list key. */
export async function startImport(lists: { key: string; name: string; reminder?: string }[], newSubscribed: number) {
  const { workspace, role } = await requireSession();
  if (!["owner", "admin"].includes(role)) return { error: "Only admins can import." };
  const u = await usage(workspace.id);
  if (u.contacts + newSubscribed > workspace.plan.contact_limit) {
    return {
      error: `This import has ${newSubscribed.toLocaleString("en-AU")} subscribed contacts, but the ${workspace.plan.name} plan allows ${workspace.plan.contact_limit.toLocaleString("en-AU")} (you have ${u.contacts.toLocaleString("en-AU")}). Change plan first, then import.`,
      needsPlan: true,
    };
  }
  const db = admin();
  const ids: Record<string, string> = {};
  for (const l of lists) {
    const name = l.name.trim().slice(0, 80) || "Imported list";
    const { data: existing } = await db.from("lists").select("id").eq("workspace_id", workspace.id).ilike("name", name).maybeSingle();
    if (existing) ids[l.key] = existing.id;
    else {
      const { data, error } = await db
        .from("lists")
        .insert({ workspace_id: workspace.id, name, description: "Imported", double_opt_in: false, permission_reminder: l.reminder?.trim() || null })
        .select("id")
        .single();
      if (error) return { error: error.message };
      ids[l.key] = data.id;
    }
  }
  return { ids };
}

/** Import up to 500 members of one list. Merges with existing contacts; unsubscribes and bounces are kept. */
export async function importChunk(listId: string, rows: Row[]) {
  const { workspace } = await requireSession();
  if (rows.length > 500) return { error: "Too many rows" };
  const db = admin();
  try {
    const { data: list } = await db.from("lists").select("id").eq("id", listId).eq("workspace_id", workspace.id).maybeSingle();
    if (!list) return { error: "List not found" };
    const emails = rows.map((r) => r.email);
    const existing = new Map<string, { status: string; tags: string[]; fields: Record<string, unknown>; first_name: string | null; last_name: string | null }>();
    for (let i = 0; i < emails.length; i += 150) {
      const { data } = await db.from("contacts").select("email, status, tags, fields, first_name, last_name").eq("workspace_id", workspace.id).in("email", emails.slice(i, i + 150));
      (data ?? []).forEach((c) => existing.set(c.email.toLowerCase(), c as never));
    }
    const now = new Date().toISOString();
    const upserts = rows.map((r) => {
      const e = existing.get(r.email);
      // Never resubscribe someone who unsubscribed, bounced or complained here.
      const status = e && e.status !== "subscribed" ? e.status : r.overall;
      return {
        workspace_id: workspace.id,
        email: r.email,
        first_name: e?.first_name || r.first_name,
        last_name: e?.last_name || r.last_name,
        fields: { ...r.fields, ...(e?.fields ?? {}) },
        tags: [...new Set([...(e?.tags ?? []), ...r.tags])],
        status,
        consent_source: "provider_import",
        consented_at: r.optin_at ?? now,
        unsubscribed_at: status === "unsubscribed" ? r.changed_at ?? now : null,
      };
    });
    const { error } = await db.from("contacts").upsert(upserts, { onConflict: "workspace_id,email" });
    if (error) throw new Error(error.message);

    const ids = new Map<string, string>();
    for (let i = 0; i < emails.length; i += 150) {
      const { data } = await db.from("contacts").select("id, email").eq("workspace_id", workspace.id).in("email", emails.slice(i, i + 150));
      (data ?? []).forEach((c) => ids.set(c.email.toLowerCase(), c.id));
    }
    const members = rows
      .filter((r) => ids.has(r.email))
      .map((r) => ({ list_id: listId, contact_id: ids.get(r.email)!, workspace_id: workspace.id, status: r.status === "subscribed" ? "subscribed" : "unsubscribed" }));
    const { error: mErr } = await db.from("list_members").upsert(members, { onConflict: "list_id,contact_id" });
    if (mErr) throw new Error(mErr.message);

    // Bounced (cleaned) addresses go on this workspace's suppression list too.
    const cleaned = rows.filter((r) => r.status === "cleaned").map((r) => ({ workspace_id: workspace.id, email: r.email, reason: "bounce" }));
    if (cleaned.length) await db.from("suppressions").upsert(cleaned, { onConflict: "workspace_id,email", ignoreDuplicates: true });

    return { ok: rows.length };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function importTemplate(name: string, html: string) {
  const { workspace } = await requireSession();
  if (html.length > 2_000_000) return { error: "Template too large" };
  const { error } = await admin().from("templates").insert({ workspace_id: workspace.id, name: `${name} (imported)`.slice(0, 120), html });
  return error ? { error: error.message } : { ok: true };
}

export async function finishImport() {
  await requireSession();
  revalidatePath("/app/contacts", "layout");
  revalidatePath("/app/media");
  revalidatePath("/app/templates");
  return { ok: true };
}
