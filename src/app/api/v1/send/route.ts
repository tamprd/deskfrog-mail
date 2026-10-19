import { ApiError, body, dbError, ok, route } from "@/lib/api";
import { admin } from "@/lib/supabase/admin";
import { transactionalInput } from "@/lib/schemas";
import { merge } from "@/lib/render";
import { assertActive, getWorkspace, remainingSends, resolveFrom } from "@/lib/workspace";

export const runtime = "nodejs";

/**
 * POST /api/v1/send — transactional email to one recipient (receipts, entry
 * confirmations, password resets). Not subject to marketing unsubscribes, but
 * hard bounces / complaints are still suppressed. Use {{field}} with `data`.
 */
export const POST = route(async (req, { workspaceId }) => {
  const input = await body(req, transactionalInput);
  const db = admin();
  const ws = await getWorkspace(workspaceId);
  assertActive(ws);

  if (input.idempotency_key) {
    const { data: prior } = await db
      .from("messages")
      .select("id, status, created_at")
      .eq("workspace_id", workspaceId)
      .eq("idempotency_key", input.idempotency_key)
      .maybeSingle();
    if (prior) return ok({ ...prior, duplicate: true });
  }

  if ((await remainingSends(ws)) < 1) {
    throw new ApiError(402, "send_limit", "Send limit reached for your plan. Upgrade or wait for the limit to reset.");
  }

  const { data: g } = await db.from("global_suppressions").select("reason").eq("email", input.to).maybeSingle();
  const { data: s } = await db
    .from("suppressions")
    .select("reason")
    .eq("workspace_id", workspaceId)
    .eq("email", input.to)
    .in("reason", ["bounce", "complaint"])
    .maybeSingle();
  if (g || s) throw new ApiError(422, "suppressed", `${input.to} is suppressed (${g?.reason ?? s?.reason}) and can't be emailed`);

  let { html, text, subject } = input;
  if (input.template_id) {
    const { data: t } = await db
      .from("templates")
      .select("html, text, subject")
      .eq("workspace_id", workspaceId)
      .eq("id", input.template_id)
      .maybeSingle();
    if (!t) throw new ApiError(404, "template_not_found", "Template not found");
    html ??= t.html;
    text ??= t.text ?? undefined;
    subject ||= t.subject;
  }

  const mc = { email: input.to, fields: input.data ?? {} };
  const { from, replyTo } = await resolveFrom(ws, input.from_name, input.from_email);
  const { data: contact } = await db.from("contacts").select("id").eq("workspace_id", workspaceId).eq("email", input.to).maybeSingle();

  const { data, error } = await db
    .from("messages")
    .insert({
      workspace_id: workspaceId,
      contact_id: contact?.id ?? null,
      kind: "transactional",
      to_email: input.to,
      from_header: from,
      reply_to: input.reply_to ?? replyTo ?? null,
      subject: merge(subject, mc, true),
      html: html ? merge(html, mc) : null,
      text: text ? merge(text, mc, true) : null,
      idempotency_key: input.idempotency_key ?? null,
    })
    .select("id, status, created_at")
    .single();
  dbError(error);
  return ok(data, 202);
});
