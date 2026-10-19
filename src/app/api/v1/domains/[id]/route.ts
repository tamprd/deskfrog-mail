import { ApiError, dbError, ok, route } from "@/lib/api";
import { admin } from "@/lib/supabase/admin";
import { domainStatus } from "@/lib/ses";

export const runtime = "nodejs";
type P = { id: string };

/** GET re-checks verification with SES and updates the stored status. */
export const GET = route<P>(async (_req, { workspaceId }, { id }) => {
  const db = admin();
  const { data: d } = await db.from("sending_domains").select("*").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  if (!d) throw new ApiError(404, "not_found", "Domain not found");
  const s = await domainStatus(d.domain);
  const status = s.verified ? "verified" : s.dkimStatus === "FAILED" ? "failed" : "pending";
  const { data, error } = await db
    .from("sending_domains")
    .update({ status, dns_records: s.records, verified_at: s.verified ? d.verified_at ?? new Date().toISOString() : null })
    .eq("id", id)
    .select("id, domain, status, dns_records, verified_at")
    .single();
  dbError(error);
  return ok(data);
});

export const DELETE = route<P>(async (_req, { workspaceId }, { id }) => {
  const { data, error } = await admin().from("sending_domains").delete().eq("workspace_id", workspaceId).eq("id", id).select("id");
  dbError(error);
  if (!data?.length) throw new ApiError(404, "not_found", "Domain not found");
  return ok({ id, deleted: true });
});
