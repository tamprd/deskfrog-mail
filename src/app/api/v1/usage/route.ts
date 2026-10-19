import { ok, route } from "@/lib/api";
import { dailyCap, getWorkspace, usage } from "@/lib/workspace";

export const runtime = "nodejs";

export const GET = route(async (_req, { workspaceId }) => {
  const ws = await getWorkspace(workspaceId);
  const u = await usage(workspaceId);
  return ok({
    plan: ws.plan.id,
    status: ws.status,
    status_reason: ws.status_reason,
    contacts: { used: u.contacts, limit: ws.plan.contact_limit },
    sends_today: { used: u.sentToday, queued: u.queued, limit: dailyCap(ws) },
    sends_this_month: { used: u.sentThisMonth, limit: ws.plan.monthly_send_limit },
  });
});
