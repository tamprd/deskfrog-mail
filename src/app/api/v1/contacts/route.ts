import { ApiError, body, dbError, ok, pagination, route } from "@/lib/api";
import { admin } from "@/lib/supabase/admin";
import { contactsUpsert } from "@/lib/schemas";
import { assertContactCapacity, getWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

/** GET /api/v1/contacts?status=subscribed&tag=vip&email=…&external_id=… */
export const GET = route(async (req, { workspaceId }) => {
  const { limit, offset, url } = pagination(req);
  let q = admin()
    .from("contacts")
    .select("id, email, first_name, last_name, external_id, fields, tags, status, consent_source, consented_at, unsubscribed_at, created_at, updated_at", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  const p = url.searchParams;
  if (p.get("status")) q = q.eq("status", p.get("status")!);
  if (p.get("email")) q = q.eq("email", p.get("email")!.toLowerCase());
  if (p.get("external_id")) q = q.eq("external_id", p.get("external_id")!);
  const tags = p.getAll("tag");
  if (tags.length) q = q.contains("tags", tags);
  const { data, count, error } = await q;
  dbError(error);
  return Response.json({ data, meta: { total: count, limit, offset } });
});

/**
 * POST /api/v1/contacts — upsert one contact, or { contacts: [...] } (≤1000).
 * Existing contacts are updated; unsubscribed/bounced contacts are NOT resubscribed.
 */
export const POST = route(async (req, { workspaceId }) => {
  const input = await body(req, contactsUpsert);
  const items = "contacts" in input ? input.contacts : [input];
  const db = admin();
  const ws = await getWorkspace(workspaceId);

  const emails = [...new Set(items.map((i) => i.email))];
  const { data: existing } = await db
    .from("contacts")
    .select("id, email, status, tags, first_name, last_name, external_id, fields, consent_source, consented_at")
    .eq("workspace_id", workspaceId)
    .in("email", emails);
  const byEmail = new Map((existing ?? []).map((c) => [c.email.toLowerCase(), c]));
  const newCount = emails.filter((e) => !byEmail.has(e)).length;
  await assertContactCapacity(ws, newCount);

  // Block re-adding globally suppressed (hard-bounced / complained) addresses.
  const { data: globalRows } = await db.from("global_suppressions").select("email, reason").in("email", emails);
  const blocked = new Map((globalRows ?? []).map((g) => [g.email.toLowerCase(), g.reason]));

  const now = new Date().toISOString();
  const rows = items.map((i) => {
    const prev = byEmail.get(i.email);
    const status = blocked.has(i.email)
      ? blocked.get(i.email) === "complaint" ? "complained" : "bounced"
      : prev?.status ?? "subscribed";
    return {
      workspace_id: workspaceId,
      email: i.email,
      // Only overwrite what the caller sent; merge fields and tags.
      first_name: i.first_name !== undefined ? i.first_name : prev?.first_name ?? null,
      last_name: i.last_name !== undefined ? i.last_name : prev?.last_name ?? null,
      external_id: i.external_id !== undefined ? i.external_id : prev?.external_id ?? null,
      fields: { ...(prev?.fields ?? {}), ...(i.fields ?? {}) },
      tags: [...new Set([...(prev?.tags ?? []), ...(i.tags ?? [])])],
      status,
      consent_source: prev?.consent_source ?? i.consent_source,
      consented_at: prev?.consented_at ?? i.consented_at ?? now,
    };
  });

  const { data, error } = await db
    .from("contacts")
    .upsert(rows, { onConflict: "workspace_id,email" })
    .select("id, email, status, tags, external_id");
  dbError(error);

  // List memberships.
  const listIds = [...new Set(items.flatMap((i) => i.lists ?? []))];
  if (listIds.length) {
    const { data: lists } = await db.from("lists").select("id").eq("workspace_id", workspaceId).in("id", listIds);
    const valid = new Set((lists ?? []).map((l) => l.id));
    const missing = listIds.filter((id) => !valid.has(id));
    if (missing.length) throw new ApiError(404, "list_not_found", `Unknown list(s): ${missing.join(", ")}`);
    const idByEmail = new Map((data ?? []).map((c) => [c.email.toLowerCase(), c.id]));
    const members = items.flatMap((i) =>
      (i.lists ?? []).map((list_id) => ({ list_id, contact_id: idByEmail.get(i.email)!, workspace_id: workspaceId })),
    );
    const { error: lmErr } = await db.from("list_members").upsert(members, { onConflict: "list_id,contact_id", ignoreDuplicates: true });
    dbError(lmErr);
  }

  return ok("contacts" in input ? data : data?.[0], 201);
});
