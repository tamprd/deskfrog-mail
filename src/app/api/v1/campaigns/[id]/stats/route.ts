import { ApiError, ok, route } from "@/lib/api";
import { admin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export const GET = route<{ id: string }>(async (_req, { workspaceId }, { id }) => {
  const db = admin();
  const { data: c } = await db.from("campaigns").select("id, status").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  if (!c) throw new ApiError(404, "not_found", "Campaign not found");
  const { data: s, error } = await db.rpc("campaign_stats", { cid: id }).single<Record<string, number>>();
  if (error) throw new Error(error.message);
  const rate = (n: number, d: number) => (d ? Math.round((n / d) * 10000) / 100 : 0);
  return ok({
    id,
    status: c.status,
    ...s,
    open_rate: rate(s.opened, s.delivered || s.sent),
    click_rate: rate(s.clicked, s.delivered || s.sent),
    bounce_rate: rate(s.bounced, s.sent),
  });
});
