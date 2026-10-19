import { ApiError, body, dbError, ok, route } from "@/lib/api";
import { admin } from "@/lib/supabase/admin";
import { listMembersInput } from "@/lib/schemas";

export const runtime = "nodejs";
type P = { id: string };

async function assertList(workspaceId: string, id: string) {
  const { data } = await admin().from("lists").select("id").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  if (!data) throw new ApiError(404, "not_found", "List not found");
}

async function resolveContacts(workspaceId: string, input: { contact_ids?: string[]; emails?: string[] }) {
  const db = admin();
  const ids = new Set<string>();
  if (input.contact_ids?.length) {
    const { data } = await db.from("contacts").select("id").eq("workspace_id", workspaceId).in("id", input.contact_ids);
    data?.forEach((c) => ids.add(c.id));
  }
  if (input.emails?.length) {
    const { data } = await db.from("contacts").select("id").eq("workspace_id", workspaceId).in("email", input.emails);
    data?.forEach((c) => ids.add(c.id));
  }
  return [...ids];
}

/** Add existing contacts to a list. Create contacts first via POST /contacts. */
export const POST = route<P>(async (req, { workspaceId }, { id }) => {
  await assertList(workspaceId, id);
  const input = await body(req, listMembersInput);
  const contactIds = await resolveContacts(workspaceId, input);
  if (contactIds.length) {
    const { error } = await admin()
      .from("list_members")
      .upsert(
        contactIds.map((contact_id) => ({ list_id: id, contact_id, workspace_id: workspaceId, status: "subscribed" })),
        { onConflict: "list_id,contact_id" },
      );
    dbError(error);
  }
  return ok({ added: contactIds.length });
});

export const DELETE = route<P>(async (req, { workspaceId }, { id }) => {
  await assertList(workspaceId, id);
  const input = await body(req, listMembersInput);
  const contactIds = await resolveContacts(workspaceId, input);
  if (contactIds.length) {
    const { error } = await admin().from("list_members").delete().eq("list_id", id).in("contact_id", contactIds);
    dbError(error);
  }
  return ok({ removed: contactIds.length });
});
