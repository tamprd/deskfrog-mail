import { body, dbError, ok, route } from "@/lib/api";
import { admin } from "@/lib/supabase/admin";
import { templateInput } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = route(async (_req, { workspaceId }) => {
  const { data, error } = await admin()
    .from("templates")
    .select("id, name, subject, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  dbError(error);
  return ok(data);
});

export const POST = route(async (req, { workspaceId }) => {
  const input = await body(req, templateInput);
  const { data, error } = await admin()
    .from("templates")
    .insert({ ...input, workspace_id: workspaceId })
    .select()
    .single();
  dbError(error);
  return ok(data, 201);
});
