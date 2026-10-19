import { ApiError, body, dbError, ok, pagination, route } from "@/lib/api";
import { admin } from "@/lib/supabase/admin";
import { campaignInput } from "@/lib/schemas";

export const runtime = "nodejs";

const COLUMNS =
  "id, name, subject, from_name, from_email, reply_to, list_id, tag_filter, template_id, status, scheduled_at, started_at, completed_at, recipient_count, created_at, updated_at";

export const GET = route(async (req, { workspaceId }) => {
  const { limit, offset, url } = pagination(req);
  let q = admin()
    .from("campaigns")
    .select(COLUMNS, { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (url.searchParams.get("status")) q = q.eq("status", url.searchParams.get("status")!);
  const { data, count, error } = await q;
  dbError(error);
  return Response.json({ data, meta: { total: count, limit, offset } });
});

/** Create a draft. Content comes from `html`, or is copied from `template_id`. */
export const POST = route(async (req, { workspaceId }) => {
  const input = await body(req, campaignInput);
  const db = admin();
  let html = input.html;
  let text = input.text ?? null;

  if (input.template_id) {
    const { data: t } = await db
      .from("templates")
      .select("html, text")
      .eq("workspace_id", workspaceId)
      .eq("id", input.template_id)
      .maybeSingle();
    if (!t) throw new ApiError(404, "template_not_found", "Template not found");
    html ??= t.html;
    text ??= t.text;
  }
  if (!html) throw new ApiError(422, "invalid_request", "Provide html or template_id");

  if (input.list_id) {
    const { data: l } = await db.from("lists").select("id").eq("workspace_id", workspaceId).eq("id", input.list_id).maybeSingle();
    if (!l) throw new ApiError(404, "list_not_found", "List not found");
  }

  const { data, error } = await db
    .from("campaigns")
    .insert({ ...input, html, text, tag_filter: input.tag_filter ?? [], workspace_id: workspaceId })
    .select(COLUMNS)
    .single();
  dbError(error);
  return ok(data, 201);
});
