import { body, dbError, ok, route } from "@/lib/api";
import { admin } from "@/lib/supabase/admin";
import { listInput } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = route(async (_req, { workspaceId }) => {
  const { data, error } = await admin()
    .from("lists")
    .select("id, name, description, double_opt_in, created_at, members:list_members(count)")
    .eq("workspace_id", workspaceId)
    .eq("list_members.status", "subscribed")
    .order("created_at");
  dbError(error);
  return ok(
    (data ?? []).map(({ members, ...l }) => ({ ...l, subscribed_count: (members as { count: number }[])[0]?.count ?? 0 })),
  );
});

export const POST = route(async (req, { workspaceId }) => {
  const input = await body(req, listInput);
  const { data, error } = await admin()
    .from("lists")
    .insert({ ...input, workspace_id: workspaceId })
    .select()
    .single();
  dbError(error);
  return ok(data, 201);
});
