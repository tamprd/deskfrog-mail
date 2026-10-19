import Link from "next/link";
import { requireSession } from "@/lib/session";
import { brandFor, savedGallery, starterGallery, type GalleryItem } from "@/lib/email/gallery";
import { TEMPLATE_CATEGORIES } from "@/lib/email/templates";
import { TemplateThumb } from "@/components/template-thumb";
import { deleteTemplate } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Templates · Desk Frog Mail" };

function Card({ t }: { t: GalleryItem }) {
  return (
    <div className="group card overflow-hidden p-3">
      <TemplateThumb html={t.previewHtml} title={t.name} />
      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{t.name}</p>
          <p className="truncate text-xs text-muted">{t.description}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Link href={`/app/campaigns/new?template=${encodeURIComponent(t.key)}`} className="btn-primary flex-1">Use</Link>
        {t.savedId && (
          <form action={deleteTemplate}>
            <input type="hidden" name="id" value={t.savedId} />
            <button className="btn-danger px-3" aria-label={`Delete ${t.name}`} title="Delete">✕</button>
          </form>
        )}
      </div>
    </div>
  );
}

export default async function Templates() {
  const { workspace } = await requireSession();
  const brand = await brandFor(workspace.id);
  const [starters, saved] = await Promise.all([starterGallery(brand), savedGallery(workspace.id, brand)]);

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
          <p className="text-muted">Previews use your brand colours and logo. Pick one to start a campaign.</p>
        </div>
        <Link href="/app/settings#brand" className="btn-secondary">Edit brand</Link>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Your templates</h2>
        {saved.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{saved.map((t) => <Card key={t.key} t={t} />)}</div>
        ) : (
          <p className="card p-6 text-sm text-muted">None yet. In the email editor, click <strong>Save as template</strong> to reuse a design.</p>
        )}
      </section>

      {TEMPLATE_CATEGORIES.map((cat) => (
        <section key={cat}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{cat}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {starters.filter((t) => t.category === cat).map((t) => <Card key={t.key} t={t} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
