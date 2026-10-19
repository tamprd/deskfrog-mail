import { ApiError, body, ok, route } from "@/lib/api";
import { admin } from "@/lib/supabase/admin";
import { campaignSend } from "@/lib/schemas";
import { enqueueCampaign } from "@/lib/campaigns";

export const runtime = "nodejs";
type P = { id: string };

/** POST /campaigns/:id/send — send now, or { scheduled_at } to schedule. */
export const POST = route<P>(async (req, { workspaceId }, { id }) => {
  const input = req.headers.get("content-length") === "0" ? {} : await body(req, campaignSend).catch(() => ({}));
  const when = "scheduled_at" in input && input.scheduled_at ? new Date(input.scheduled_at) : null;

  if (when && when.getTime() > Date.now() + 60_000) {
    const { data } = await admin()
      .from("campaigns")
      .update({ status: "scheduled", scheduled_at: when.toISOString() })
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .eq("status", "draft")
      .select("id, status, scheduled_at")
      .maybeSingle();
    if (!data) throw new ApiError(409, "invalid_state", "Only draft campaigns can be scheduled");
    return ok(data);
  }

  const { recipients } = await enqueueCampaign(id, workspaceId);
  return ok({ id, status: recipients ? "sending" : "sent", recipients });
});
