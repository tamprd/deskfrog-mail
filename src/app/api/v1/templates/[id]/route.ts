import { ApiError, body, dbError, ok, route } from "@/lib/api";
import { admin } from "@/lib/supabase/admin";
import { templateInput } from "@/lib/schemas";

export const runtime = "nodejs";
type P = { id: string };

export const GET = route<P>(async (_req, { workspaceId }, { id }) => {
  const { data } = await admin().from("templates").select("*").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  if (!data) throw new ApiError(404, "not_found", "Template not found");
  return ok(data);
});

export const PATCH = route<P>(async (req, { workspaceId }, { id }) => {
  const input = await body(req, templateInput.partial());
  const { data, error } = await admin()
    .from("templates")
    .update(input)
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .select()
    .maybeSingle();
  dbError(error);
  if (!data) throw new ApiError(404, "not_found", "Template not found");
  return ok(data);
});

export const DELETE = route<P>(async (_req, { workspaceId }, { id }) => {
  const { data, error } = await admin().from("templates").delete().eq("workspace_id", workspaceId).eq("id", id).select("id");
  dbError(error);
  if (!data?.length) throw new ApiError(404, "not_found", "Template not found");
  return ok({ id, deleted: true });
});
