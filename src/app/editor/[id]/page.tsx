import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { emptyDesign, isDesign, type Brand, type Design } from "@/lib/email/design";
import { EmailEditor } from "@/components/editor/email-editor";
import { previewDesign, saveAsTemplate, saveDesign, sendTest, uploadImage } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Design email · Desk Frog Mail" };

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace } = await requireSession();
  const db = admin();
  const [{ data: c }, { data: ws }] = await Promise.all([
    db.from("campaigns").select("id, name, subject, from_name, status, design, html").eq("workspace_id", workspace.id).eq("id", id).maybeSingle(),
    db.from("workspaces").select("brand").eq("id", workspace.id).single(),
  ]);
  if (!c) notFound();
  if (c.status !== "draft") redirect(`/app/campaigns/${id}`);

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
      actions={{ save, preview: previewDesign, sendTest: test, upload: uploadImage, saveTemplate: saveAsTemplate }}
    />
  );
}
