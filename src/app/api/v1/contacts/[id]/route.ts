import { ApiError, body, dbError, ok, route } from "@/lib/api";
import { admin } from "@/lib/supabase/admin";
import { contactPatch } from "@/lib/schemas";
import { unsubscribeContact } from "@/lib/suppress";

export const runtime = "nodejs";
type P = { id: string };

async function load(workspaceId: string, id: string) {
  const { data, error } = await admin()
    .from("contacts")
    .select("id, email, first_name, last_name, external_id, fields, tags, status, consent_source, consented_at, unsubscribed_at, created_at, updated_at, lists:list_members(list_id, status)")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  dbError(error);
  if (!data) throw new ApiError(404, "not_found", "Contact not found");
  return data;
}

export const GET = route<P>(async (_req, { workspaceId }, { id }) => ok(await load(workspaceId, id)));

export const PATCH = route<P>(async (req, { workspaceId }, { id }) => {
  const input = await body(req, contactPatch);
  const current = await load(workspaceId, id);
  const db = admin();

  if (input.status === "unsubscribed") {
    await unsubscribeContact(id, "api");
  } else if (input.status === "subscribed" && current.status !== "subscribed") {
    // Only allow re-subscribing a voluntary unsubscribe; bounces/complaints stay suppressed.
    if (current.status !== "unsubscribed") {
      throw new ApiError(409, "suppressed", `Contact is ${current.status} and can't be resubscribed`);
    }
    await db.from("suppressions").delete().eq("workspace_id", workspaceId).eq("email", current.email).eq("reason", "unsubscribe");
    await db.from("contacts").update({ status: "subscribed", unsubscribed_at: null, consented_at: new Date().toISOString() }).eq("id", id);
  }

  let tags = input.tags ?? current.tags;
  if (input.add_tags) tags = [...new Set([...tags, ...input.add_tags])];
  if (input.remove_tags) tags = tags.filter((t: string) => !input.remove_tags!.includes(t));

  const patch: Record<string, unknown> = { tags };
  for (const k of ["first_name", "last_name", "external_id", "consented_at"] as const) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  if (input.fields) patch.fields = { ...(current.fields as object), ...input.fields };

  const { error } = await db.from("contacts").update(patch).eq("id", id).eq("workspace_id", workspaceId);
  dbError(error);
  return ok(await load(workspaceId, id));
});

/** Hard delete (e.g. privacy request). Suppression entries are kept so they can't be re-mailed. */
export const DELETE = route<P>(async (_req, { workspaceId }, { id }) => {
  const { data, error } = await admin().from("contacts").delete().eq("workspace_id", workspaceId).eq("id", id).select("id");
  dbError(error);
  if (!data?.length) throw new ApiError(404, "not_found", "Contact not found");
  return ok({ id, deleted: true });
});
