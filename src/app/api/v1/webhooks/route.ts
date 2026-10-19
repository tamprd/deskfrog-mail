import { ApiError, body, dbError, ok, route } from "@/lib/api";
import { admin } from "@/lib/supabase/admin";
import { webhookInput } from "@/lib/schemas";
import { WEBHOOK_EVENTS, newWebhookSecret } from "@/lib/webhooks";

export const runtime = "nodejs";

export const GET = route(async (_req, { workspaceId }) => {
  const { data, error } = await admin()
    .from("webhook_endpoints")
    .select("id, url, events, active, created_at")
    .eq("workspace_id", workspaceId);
  dbError(error);
  return ok(data);
});

/** The signing secret is only returned once, here. */
export const POST = route(async (req, { workspaceId }) => {
  const input = await body(req, webhookInput);
  const bad = (input.events ?? []).filter((e) => !(WEBHOOK_EVENTS as readonly string[]).includes(e));
  if (bad.length) throw new ApiError(422, "invalid_event", `Unknown events: ${bad.join(", ")}`, { allowed: WEBHOOK_EVENTS });
  const { data, error } = await admin()
    .from("webhook_endpoints")
    .insert({ workspace_id: workspaceId, url: input.url, events: input.events ?? [], secret: newWebhookSecret() })
    .select("id, url, events, active, secret, created_at")
    .single();
  dbError(error);
  return ok(data, 201);
});
