import { ApiError, body, dbError, ok, route } from "@/lib/api";
import { admin } from "@/lib/supabase/admin";
import { campaignInput } from "@/lib/schemas";

export const runtime = "nodejs";
type P = { id: string };

async function load(workspaceId: string, id: string) {
  const { data } = await admin().from("campaigns").select("*").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  if (!data) throw new ApiError(404, "not_found", "Campaign not found");
  return data;
}

export const GET = route<P>(async (_req, { workspaceId }, { id }) => ok(await load(workspaceId, id)));

export const PATCH = route<P>(async (req, { workspaceId }, { id }) => {
  const current = await load(workspaceId, id);
  if (current.status !== "draft") throw new ApiError(409, "invalid_state", `Only drafts can be edited (campaign is ${current.status})`);
  const input = await body(req, campaignInput.partial());
  const { data, error } = await admin()
    .from("campaigns")
    .update(input)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();
  dbError(error);
  return ok(data);
});

/** Drafts are deleted; scheduled campaigns are cancelled; sending campaigns are stopped. */
export const DELETE = route<P>(async (_req, { workspaceId }, { id }) => {
  const current = await load(workspaceId, id);
  const db = admin();
  if (current.status === "draft") {
    await db.from("campaigns").delete().eq("id", id);
    return ok({ id, deleted: true });
  }
  if (current.status === "scheduled" || current.status === "sending") {
    await db.from("campaigns").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", id);
    const { data: dropped } = await db
      .from("messages")
      .update({ status: "suppressed", last_error: "campaign cancelled" })
      .eq("campaign_id", id)
      .eq("status", "queued")
      .select("id");
    return ok({ id, cancelled: true, unsent: dropped?.length ?? 0 });
  }
  throw new ApiError(409, "invalid_state", `Campaign is ${current.status}`);
});
