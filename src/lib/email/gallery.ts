import "server-only";
import { admin } from "@/lib/supabase/admin";
import { isDesign, type Brand } from "./design";
import { renderDesign } from "./render";
import { STARTER_TEMPLATES, type TemplateCategory } from "./templates";
import { merge } from "@/lib/render";

export type GalleryItem = {
  key: string; // "starter:<id>" or "saved:<uuid>"
  name: string;
  description: string;
  category: TemplateCategory | "Yours";
  previewHtml: string;
  savedId?: string;
};

/** Sample data so thumbnails read naturally instead of showing {{tags}}. */
const SAMPLE = {
  email: "alex@example.com",
  first_name: "Alex",
  last_name: "Sample",
  fields: { vehicle: "Hilux", rego: "123 ABC", service_due: "November" },
};

const cache = new Map<string, string>();

async function preview(key: string, build: () => Promise<string>) {
  if (!cache.has(key)) {
    if (cache.size > 500) cache.clear();
    cache.set(key, merge(await build(), SAMPLE));
  }
  return cache.get(key)!;
}

export async function brandFor(workspaceId: string): Promise<Partial<Brand>> {
  const { data } = await admin().from("workspaces").select("brand").eq("id", workspaceId).single();
  return (data?.brand ?? {}) as Partial<Brand>;
}

export async function starterGallery(brand: Partial<Brand>): Promise<GalleryItem[]> {
  const brandKey = JSON.stringify(brand);
  return Promise.all(
    STARTER_TEMPLATES.map(async (t) => ({
      key: `starter:${t.id}`,
      name: t.name,
      description: t.description,
      category: t.category,
      previewHtml: await preview(`${brandKey}:${t.id}`, () => renderDesign(t.build(brand), brand, { placeholders: true })),
    })),
  );
}

export async function savedGallery(workspaceId: string, brand: Partial<Brand>): Promise<GalleryItem[]> {
  const { data } = await admin()
    .from("templates")
    .select("id, name, subject, design, html, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(100);
  const brandKey = JSON.stringify(brand);
  return Promise.all(
    (data ?? []).map(async (t) => ({
      key: `saved:${t.id}`,
      savedId: t.id,
      name: t.name,
      description: t.subject || "Saved template",
      category: "Yours" as const,
      previewHtml: await preview(`${brandKey}:${t.id}:${t.updated_at}`, async () =>
        isDesign(t.design) ? renderDesign(t.design, brand, { placeholders: true }) : t.html,
      ),
    })),
  );
}
