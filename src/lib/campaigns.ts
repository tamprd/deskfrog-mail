import "server-only";
import { admin } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api";
import { assertActive, getWorkspace, remainingSends, resolveFrom } from "@/lib/workspace";

/** Validate limits and expand a campaign into queued messages. */
export async function enqueueCampaign(campaignId: string, workspaceId: string) {
  const db = admin();
  const { data: c } = await db
    .from("campaigns")
    .select("id, status, from_name, from_email, reply_to, html, text, subject, format")
    .eq("id", campaignId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!c) throw new ApiError(404, "not_found", "Campaign not found");
  if (!["draft", "scheduled"].includes(c.status)) throw new ApiError(409, "invalid_state", `Campaign is already ${c.status}`);
  const body = c.format === "text" ? c.text : c.html;
  if (!body?.trim() || !c.subject?.trim()) throw new ApiError(422, "incomplete", "Campaign needs a subject and content");

  const ws = await getWorkspace(workspaceId);
  assertActive(ws);
  if (ws.plan.id !== "free" && !ws.sender_address) {
    // Free plan shows Desk Frog's identification; paid senders must identify themselves.
    throw new ApiError(422, "sender_address_required", "Set your business postal address in settings before sending campaigns.");
  }
  const { from, replyTo } = await resolveFrom(ws, c.from_name, c.from_email);
  if (replyTo && !c.reply_to) await db.from("campaigns").update({ reply_to: replyTo }).eq("id", c.id);

  const remaining = await remainingSends(ws);
  const { data: n, error } = await db.rpc("enqueue_campaign", {
    cid: c.id,
    from_hdr: from,
    max_recipients: remaining,
  });
  if (error) {
    if (error.hint === "limit") {
      throw new ApiError(402, "send_limit", `${error.message}. You can send ${remaining} more right now — upgrade or wait for your limit to reset.`);
    }
    throw new Error(error.message);
  }
  return { recipients: n as number };
}

/** Called by the worker: send any scheduled campaigns that are due. */
export async function releaseScheduled() {
  const { data } = await admin()
    .from("campaigns")
    .select("id, workspace_id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(20);
  for (const c of data ?? []) {
    try {
      await enqueueCampaign(c.id, c.workspace_id);
    } catch (err) {
      await admin()
        .from("campaigns")
        .update({ status: "failed" })
        .eq("id", c.id);
      console.error("scheduled campaign failed", c.id, err);
    }
  }
}
