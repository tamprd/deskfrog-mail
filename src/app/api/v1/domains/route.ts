import { ApiError, body, dbError, ok, route } from "@/lib/api";
import { admin } from "@/lib/supabase/admin";
import { domainInput } from "@/lib/schemas";
import { createDomainIdentity } from "@/lib/ses";
import { getWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

export const GET = route(async (_req, { workspaceId }) => {
  const { data, error } = await admin()
    .from("sending_domains")
    .select("id, domain, status, dns_records, verified_at, created_at")
    .eq("workspace_id", workspaceId);
  dbError(error);
  return ok(data);
});

/** Add a sending domain. Returns the DKIM/DMARC records to add at your DNS host. */
export const POST = route(async (req, { workspaceId }) => {
  const ws = await getWorkspace(workspaceId);
  if (!ws.plan.custom_domain) {
    throw new ApiError(402, "upgrade_required", "Custom sending domains are available on paid plans.");
  }
  const { domain } = await body(req, domainInput);
  if (domain.endsWith("deskfrog.studio")) throw new ApiError(422, "invalid_domain", "That domain is reserved");

  // A domain can only be verified by one workspace.
  const { data: taken } = await admin()
    .from("sending_domains")
    .select("workspace_id")
    .eq("domain", domain)
    .neq("workspace_id", workspaceId)
    .limit(1);
  if (taken?.length) throw new ApiError(409, "conflict", "That domain belongs to another workspace");

  const identity = await createDomainIdentity(domain);
  const { data, error } = await admin()
    .from("sending_domains")
    .upsert(
      {
        workspace_id: workspaceId,
        domain,
        dns_records: identity.records,
        status: identity.verified ? "verified" : "pending",
        verified_at: identity.verified ? new Date().toISOString() : null,
      },
      { onConflict: "workspace_id,domain" },
    )
    .select("id, domain, status, dns_records, verified_at")
    .single();
  dbError(error);
  return ok(data, 201);
});
