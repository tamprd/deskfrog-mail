import { ApiError, dbError, ok, route } from "@/lib/api";
import { admin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export const DELETE = route<{ id: string }>(async (_req, { workspaceId }, { id }) => {
  const { data, error } = await admin().from("webhook_endpoints").delete().eq("workspace_id", workspaceId).eq("id", id).select("id");
  dbError(error);
  if (!data?.length) throw new ApiError(404, "not_found", "Webhook not found");
  return ok({ id, deleted: true });
});
