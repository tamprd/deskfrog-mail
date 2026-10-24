"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { toOrigin } from "@/lib/forms";

const PATH = "/app/settings/forms";

function parseOrigins(raw: string) {
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  const origins = parts.map(toOrigin);
  if (origins.some((o) => !o)) return { error: "Check the website addresses, e.g. lapthelake.com.au" as const };
  return { origins: [...new Set(origins as string[])].slice(0, 10) };
}

function parseRedirect(raw: string) {
  const v = raw.trim();
  if (!v) return { url: null };
  if (!/^https:\/\/[^\s]+$/.test(v)) return { error: "The thank-you page must start with https://" as const };
  return { url: v.slice(0, 500) };
}

export async function createForm(_prev: unknown, formData: FormData) {
  const { workspace, role } = await requireSession();
  if (!["owner", "admin"].includes(role)) return { error: "Only admins can create forms." };
  const db = admin();
  const name = String(formData.get("name") || "").trim().slice(0, 80);
  if (!name) return { error: "Give the form a name." };

  const o = parseOrigins(String(formData.get("origins") || ""));
  if ("error" in o) return { error: o.error };
  const r = parseRedirect(String(formData.get("redirect_url") || ""));
  if ("error" in r) return { error: r.error };
  const tags = String(formData.get("tags") || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10);

  let listId: string | null = String(formData.get("list_id") || "") || null;
  if (listId === "new") {
    const { data: l, error } = await db.from("lists").insert({ workspace_id: workspace.id, name, description: "Signup form", double_opt_in: formData.get("double_opt_in") === "on" }).select("id").single();
    if (error || !l) return { error: error?.message ?? "Couldn't create the list." };
    listId = l.id;
  } else if (listId) {
    const { data: l } = await db.from("lists").select("id").eq("workspace_id", workspace.id).eq("id", listId).maybeSingle();
    if (!l) return { error: "That list no longer exists." };
  }

  const { error } = await db.from("signup_forms").insert({
    workspace_id: workspace.id,
    name,
    list_id: listId,
    allowed_origins: o.origins,
    tags,
    double_opt_in: formData.get("double_opt_in") === "on",
    redirect_url: r.url,
  });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { ok: "Form created. Copy the embed code below." };
}

export async function updateForm(_prev: unknown, formData: FormData) {
  const { workspace, role } = await requireSession();
  if (!["owner", "admin"].includes(role)) return { error: "Only admins can change forms." };
  const o = parseOrigins(String(formData.get("origins") || ""));
  if ("error" in o) return { error: o.error };
  const r = parseRedirect(String(formData.get("redirect_url") || ""));
  if ("error" in r) return { error: r.error };
  const { error } = await admin()
    .from("signup_forms")
    .update({ allowed_origins: o.origins, redirect_url: r.url, double_opt_in: formData.get("double_opt_in") === "on" })
    .eq("id", String(formData.get("id")))
    .eq("workspace_id", workspace.id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { ok: "Saved." };
}

export async function toggleForm(formData: FormData) {
  const { workspace, role } = await requireSession();
  if (!["owner", "admin"].includes(role)) return;
  await admin()
    .from("signup_forms")
    .update({ enabled: formData.get("enabled") === "true" })
    .eq("id", String(formData.get("id")))
    .eq("workspace_id", workspace.id);
  revalidatePath(PATH);
}

export async function deleteForm(formData: FormData) {
  const { workspace, role } = await requireSession();
  if (!["owner", "admin"].includes(role)) return;
  await admin().from("signup_forms").delete().eq("id", String(formData.get("id"))).eq("workspace_id", workspace.id);
  revalidatePath(PATH);
}
