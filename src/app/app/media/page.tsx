import { requireSession } from "@/lib/session";
import { deleteMedia, listMedia, uploadMedia } from "@/lib/media";
import { MediaLibrary } from "@/components/media-library";

export const dynamic = "force-dynamic";
export const metadata = { title: "Media · Desk Frog Mail" };

export default async function MediaPage() {
  await requireSession();
  const { items } = await listMedia();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Media</h1>
        <p className="text-muted">Every image you&apos;ve uploaded. Copy a link to use it anywhere, including in custom HTML.</p>
      </header>
      <MediaLibrary actions={{ list: listMedia, upload: uploadMedia, remove: deleteMedia }} initial={items ?? []} />
    </div>
  );
}
