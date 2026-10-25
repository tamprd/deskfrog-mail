"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { isDesign, type Brand, type Design } from "@/lib/email/design";
import { renderDesign } from "@/lib/email/render";
import { footerHtml, footerText, htmlToText, merge, withFooter } from "@/lib/render";
import { footerFor } from "@/lib/footer";
import { sendEmail } from "@/lib/ses";
import { remainingSends, resolveFrom } from "@/lib/workspace";
import { aiUsage, withCredit } from "@/lib/ai/credits";

async function brandOf(workspaceId: string): Promise<Partial<Brand>> {
  const { data } = await admin().from("workspaces").select("brand").eq("id", workspaceId).single();
  return (data?.brand ?? {}) as Partial<Brand>;
}

export async function saveDesign(campaignId: string, design: Design, meta: { subject?: string; preheader?: string }) {
  const { workspace } = await requireSession();
  if (!isDesign(design)) return { error: "Invalid design" };
  const html = await renderDesign(design, await brandOf(workspace.id));
  const patch: Record<string, unknown> = { design, html, text: null };
  if (meta.subject?.trim()) patch.subject = meta.subject.trim().slice(0, 250);
  const { data, error } = await admin()
    .from("campaigns")
    .update(patch)
    .eq("id", campaignId)
    .eq("workspace_id", workspace.id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "This campaign has already been sent and can't be edited." };
  revalidatePath(`/app/campaigns/${campaignId}`);
  revalidatePath("/app/campaigns");
  return { ok: true, savedAt: new Date().toISOString() };
}

/** Full render exactly as recipients will see it, with sample merge data and the footer. */
export async function previewDesign(design: Design, fromName: string) {
  const { workspace, user } = await requireSession();
  if (!isDesign(design)) return { error: "Invalid design" };
  const html = await renderDesign(design, await brandOf(workspace.id));
  const sample = { email: user.email ?? "you@example.com", first_name: "Alex", last_name: "Sample" };
  return {
    html: withFooter(
      merge(html, sample),
      footerHtml({ senderName: fromName || workspace.name, senderAddress: workspace.sender_address, unsubToken: "preview", badge: workspace.plan.badge_required, referralCode: workspace.referral_code }),
    ),
  };
}

/** Send the current design to the signed-in user. Counts against the plan's sends. */
export async function sendTest(campaignId: string, design: Design, subject: string) {
  const { workspace, user } = await requireSession();
  if (!user.email) return { error: "Your account has no email address." };
  if (!isDesign(design)) return { error: "Invalid design" };
  const { data: c } = await admin()
    .from("campaigns")
    .select("from_name, from_email, list_id")
    .eq("id", campaignId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (!c) return { error: "Campaign not found" };
  if ((await remainingSends(workspace)) < 1) return { error: "You've hit your send limit for now." };

  try {
    const { from, replyTo } = await resolveFrom(workspace, c.from_name, c.from_email);
    const sample = { email: user.email, first_name: "Alex", last_name: "Sample" };
    const footer = await footerFor(workspace, c, "test");
    const rendered = merge(await renderDesign(design, await brandOf(workspace.id)), sample);
    await sendEmail({
      from,
      to: user.email,
      replyTo,
      subject: `[Test] ${merge(subject, sample, true)}`,
      html: withFooter(rendered, footerHtml(footer)),
      text: htmlToText(rendered) + footerText(footer),
      tags: { workspace: workspace.id, kind: "test" },
    });
    await admin().rpc("record_sends", { ws: workspace.id, n: 1 });
    return { ok: `Test sent to ${user.email}` };
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (/Missing environment variable|credential|region/i.test(msg)) {
      return { error: "Email sending isn't set up yet." };
    }
    return { error: msg || "Couldn't send the test." };
  }
}

/** Upload an image to the media library and return its URL. */
export async function uploadImage(formData: FormData) {
  const { uploadMedia } = await import("@/lib/media");
  const r = await uploadMedia(formData);
  return r.url ? { url: r.url } : { error: r.error ?? "Upload failed" };
}

/** Save the current design as a reusable workspace template. */
export async function saveAsTemplate(name: string, design: Design, subject: string) {
  const { workspace } = await requireSession();
  if (!isDesign(design)) return { error: "Invalid design" };
  const clean = name.trim().slice(0, 120);
  if (!clean) return { error: "Give the template a name." };
  const html = await renderDesign(design, await brandOf(workspace.id));
  const { error } = await admin()
    .from("templates")
    .insert({ workspace_id: workspace.id, name: clean, subject: subject.slice(0, 250), html, design });
  if (error) return { error: error.message };
  revalidatePath("/app/templates");
  return { ok: `Saved “${clean}” to your templates.` };
}

// ── AI ───────────────────────────────────────────────────

/** Rewrite the email's copy (or one block's) from an instruction. Returns the new design; the client keeps undo. */
export async function aiRewrite(design: Design, instruction: string, onlyBlockId: string | null) {
  const { workspace } = await requireSession();
  if (!isDesign(design)) return { error: "Invalid design" };
  const ask = instruction.trim().slice(0, 1000);
  if (!ask) return { error: "Tell the AI what to change." };
  try {
    const { rewriteDesign } = await import("@/lib/ai/claude");
    const r = await withCredit(workspace.id, workspace.plan.id, () => rewriteDesign(design, ask, onlyBlockId));
    return { design: r.design, applied: r.applied, usage: await aiUsage(workspace.id, workspace.plan.id) };
  } catch (e) {
    return { error: (e as Error).message || "The AI couldn't do that. Try again." };
  }
}

export async function aiSubjects(design: Design, current: string) {
  const { workspace } = await requireSession();
  if (!isDesign(design)) return { error: "Invalid design" };
  try {
    const { subjectIdeas } = await import("@/lib/ai/claude");
    const ideas = await withCredit(workspace.id, workspace.plan.id, () => subjectIdeas(design, current));
    return { ideas, usage: await aiUsage(workspace.id, workspace.plan.id) };
  } catch (e) {
    return { error: (e as Error).message || "The AI couldn't do that. Try again." };
  }
}

// ── Raw HTML / plain-text campaigns ──────────────────────

const MAX_SOURCE = 500_000;

/** Save a raw-HTML or plain-text campaign exactly as written. */
export async function saveSource(campaignId: string, content: string, subject: string) {
  const { workspace } = await requireSession();
  if (content.length > MAX_SOURCE) return { error: "That's too large (500 KB max)." };
  const db = admin();
  const { data: c } = await db.from("campaigns").select("format").eq("id", campaignId).eq("workspace_id", workspace.id).maybeSingle();
  if (!c) return { error: "Campaign not found" };
  const patch: Record<string, unknown> =
    c.format === "text"
      ? { text: content, html: "" }
      : { html: content, text: null, design: null };
  if (subject.trim()) patch.subject = subject.trim().slice(0, 250);
  const { data, error } = await db
    .from("campaigns")
    .update(patch)
    .eq("id", campaignId)
    .eq("workspace_id", workspace.id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "This campaign has already been sent and can't be edited." };
  revalidatePath(`/app/campaigns/${campaignId}`);
  return { ok: true, savedAt: new Date().toISOString() };
}

/** Exactly what recipients get: merge sample data, add the footer (and badge on Free). */
export async function previewSource(content: string, format: "html" | "text", fromName: string) {
  const { workspace, user } = await requireSession();
  const sample = { email: user.email ?? "you@example.com", first_name: "Alex", last_name: "Sample" };
  const footer = { senderName: fromName || workspace.name, senderAddress: workspace.sender_address, unsubToken: "preview", badge: workspace.plan.badge_required, referralCode: workspace.referral_code };
  if (format === "text") return { text: merge(content, sample, true) + footerText(footer) };
  return { html: withFooter(merge(content, sample), footerHtml(footer)) };
}

export async function sendTestSource(campaignId: string, content: string, subject: string) {
  const { workspace, user } = await requireSession();
  if (!user.email) return { error: "Your account has no email address." };
  const { data: c } = await admin()
    .from("campaigns")
    .select("from_name, from_email, format, list_id")
    .eq("id", campaignId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (!c) return { error: "Campaign not found" };
  if (!content.trim()) return { error: "Add some content first." };
  if ((await remainingSends(workspace)) < 1) return { error: "You've hit your send limit for now." };
  try {
    const { from, replyTo } = await resolveFrom(workspace, c.from_name, c.from_email);
    const sample = { email: user.email, first_name: "Alex", last_name: "Sample" };
    const footer = await footerFor(workspace, c, "test");
    const isText = c.format === "text";
    await sendEmail({
      from,
      to: user.email,
      replyTo,
      subject: `[Test] ${merge(subject, sample, true)}`,
      html: isText ? null : withFooter(merge(content, sample), footerHtml(footer)),
      text: (isText ? merge(content, sample, true) : htmlToText(merge(content, sample, true))) + footerText(footer),
      tags: { workspace: workspace.id, kind: "test" },
    });
    await admin().rpc("record_sends", { ws: workspace.id, n: 1 });
    return { ok: `Test sent to ${user.email}` };
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (/Missing environment variable|credential|region/i.test(msg)) return { error: "Email sending isn't set up yet." };
    return { error: msg || "Couldn't send the test." };
  }
}
