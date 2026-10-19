"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { isDesign, type Brand, type Design } from "@/lib/email/design";
import { renderDesign } from "@/lib/email/render";
import { footerHtml, footerText, htmlToText, merge, withFooter } from "@/lib/render";
import { sendEmail } from "@/lib/ses";
import { remainingSends, resolveFrom } from "@/lib/workspace";

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
      footerHtml({ senderName: fromName || workspace.name, senderAddress: workspace.sender_address, unsubToken: "preview", badge: workspace.plan.badge_required }),
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
    .select("from_name, from_email")
    .eq("id", campaignId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (!c) return { error: "Campaign not found" };
  if ((await remainingSends(workspace)) < 1) return { error: "You've hit your send limit for now." };

  try {
    const { from, replyTo } = await resolveFrom(workspace, c.from_name, c.from_email);
    const sample = { email: user.email, first_name: "Alex", last_name: "Sample" };
    const footer = { senderName: c.from_name, senderAddress: workspace.sender_address, unsubToken: "test", badge: workspace.plan.badge_required };
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
      return { error: "Email sending isn't set up yet (Amazon SES keys missing)." };
    }
    return { error: msg || "Couldn't send the test." };
  }
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

/** Upload an image to the public email-assets bucket and return its URL. */
export async function uploadImage(formData: FormData) {
  const { workspace } = await requireSession();
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file" };
  if (!EXT[file.type]) return { error: "Use a PNG, JPG, GIF or WebP image." };
  if (file.size > 5 * 1024 * 1024) return { error: "Images must be under 5 MB." };

  const path = `${workspace.id}/${randomUUID()}.${EXT[file.type]}`;
  const db = admin();
  const { error } = await db.storage
    .from("email-assets")
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: "31536000" });
  if (error) return { error: error.message };
  return { url: db.storage.from("email-assets").getPublicUrl(path).data.publicUrl };
}
