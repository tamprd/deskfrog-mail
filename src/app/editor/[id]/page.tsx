import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { emptyDesign, isDesign, type Brand, type Design } from "@/lib/email/design";
import { EmailEditor } from "@/components/editor/email-editor";
import { aiRewrite, aiSubjects, previewDesign, previewSource, saveAsTemplate, saveDesign, saveSource, sendTest, sendTestSource, uploadImage } from "./actions";
import { SourceEditor } from "@/components/editor/source-editor";
import { aiUsage } from "@/lib/ai/credits";
import { deleteMedia, listMedia, uploadMedia } from "@/lib/media";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // AI actions
export const metadata = { title: "Design email · Desk Frog Mail" };

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace } = await requireSession();
  const db = admin();
  const [{ data: c }, { data: ws }] = await Promise.all([
    db.from("campaigns").select("id, name, subject, from_name, status, design, html, text, format").eq("workspace_id", workspace.id).eq("id", id).maybeSingle(),
    db.from("workspaces").select("brand").eq("id", workspace.id).single(),
  ]);
  if (!c) notFound();
  if (c.status !== "draft") redirect(`/app/campaigns/${id}`);

  const media = { list: listMedia, upload: uploadMedia, remove: deleteMedia };
  const info = { id: c.id, name: c.name, subject: c.subject, fromName: c.from_name };

  // Raw HTML and plain-text campaigns get the source editor (sent exactly as written).
  if (c.format === "html" || c.format === "text") {
    async function saveSrc(content: string, subject: string) {
      "use server";
      return saveSource(id, content, subject);
    }
    async function testSrc(content: string, subject: string) {
      "use server";
      return sendTestSource(id, content, subject);
    }
    return (
      <SourceEditor
        format={c.format}
        initial={(c.format === "text" ? c.text : c.html) ?? ""}
        campaign={info}
        actions={{ save: saveSrc, preview: previewSource, sendTest: testSrc, media }}
      />
    );
  }

  const brand = (ws?.brand ?? {}) as Partial<Brand>;
  let design: Design = isDesign(c.design) ? c.design : emptyDesign(brand);
  // Campaigns created from raw HTML (API) open as a single HTML block so nothing is lost.
  if (!isDesign(c.design) && c.html?.trim()) {
    design = { ...design, blocks: [{ id: "legacy", type: "html", html: c.html }] };
  }

  async function save(d: Design, meta: { subject?: string }) {
    "use server";
    return saveDesign(id, d, meta);
  }
  async function test(d: Design, subject: string) {
    "use server";
    return sendTest(id, d, subject);
  }

  return (
    <EmailEditor
      initial={design}
      brand={brand}
      campaign={{ id: c.id, name: c.name, subject: c.subject, fromName: c.from_name }}
      actions={{ save, preview: previewDesign, sendTest: test, upload: uploadImage, media, saveTemplate: saveAsTemplate, aiRewrite, aiSubjects }}
      aiUsage={await aiUsage(workspace.id, workspace.plan.id)}
    />
  );
}
