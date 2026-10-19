"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";

const BUCKET = "email-assets";
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
const MAX = 5 * 1024 * 1024;

export type MediaItem = { path: string; name: string; url: string; size: number; type: string; createdAt: string };

/** "Track day banner.JPG" → "track-day-banner" */
const slug = (name: string) =>
  name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "image";

/** Readable name from a stored path: "<ws>/track-day-banner-1a2b3c.jpg" → "track-day-banner.jpg" */
const display = (file: string) => {
  const m = /^(.*)-[0-9a-f]{6}\.(\w+)$/.exec(file);
  if (m) return `${m[1]}.${m[2]}`;
  // Older uploads were stored as <uuid>.<ext>
  return /^[0-9a-f-]{36}\.\w+$/.test(file) ? `image.${file.split(".").pop()}` : file;
};

export async function listMedia(): Promise<{ items?: MediaItem[]; error?: string }> {
  const { workspace } = await requireSession();
  const db = admin();
  const { data, error } = await db.storage.from(BUCKET).list(workspace.id, { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
  if (error) return { error: error.message };
  return {
    items: (data ?? [])
      .filter((f) => f.id && f.name !== ".emptyFolderPlaceholder")
      .map((f) => {
        const path = `${workspace.id}/${f.name}`;
        const meta = (f.metadata ?? {}) as { size?: number; mimetype?: string };
        return {
          path,
          name: display(f.name),
          url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
          size: meta.size ?? 0,
          type: meta.mimetype ?? "",
          createdAt: f.created_at ?? "",
        };
      }),
  };
}

/** Upload one or more images (form field "file", repeatable). */
export async function uploadMedia(formData: FormData): Promise<{ items?: MediaItem[]; url?: string; error?: string }> {
  const { workspace } = await requireSession();
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "No file selected." };
  const db = admin();
  const items: MediaItem[] = [];
  const problems: string[] = [];
  for (const file of files.slice(0, 20)) {
    if (!EXT[file.type]) { problems.push(`${file.name}: use PNG, JPG, GIF or WebP`); continue; }
    if (file.size > MAX) { problems.push(`${file.name}: over 5 MB`); continue; }
    const stored = `${slug(file.name)}-${randomUUID().slice(0, 6)}.${EXT[file.type]}`;
    const path = `${workspace.id}/${stored}`;
    const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: "31536000" });
    if (error) { problems.push(`${file.name}: ${error.message}`); continue; }
    items.push({ path, name: display(stored), url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, size: file.size, type: file.type, createdAt: new Date().toISOString() });
  }
  revalidatePath("/app/media");
  if (!items.length) return { error: problems.join(" · ") || "Upload failed." };
  return { items, url: items[0].url, error: problems.length ? problems.join(" · ") : undefined };
}

export async function deleteMedia(path: string): Promise<{ ok?: boolean; error?: string }> {
  const { workspace } = await requireSession();
  if (!path.startsWith(`${workspace.id}/`) || path.includes("..")) return { error: "Not allowed." };
  const { error } = await admin().storage.from(BUCKET).remove([path]);
  if (error) return { error: error.message };
  revalidatePath("/app/media");
  return { ok: true };
}
