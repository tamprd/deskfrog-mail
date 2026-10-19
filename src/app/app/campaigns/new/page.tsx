import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { brandFor, savedGallery, starterGallery } from "@/lib/email/gallery";
import { TemplateThumb } from "@/components/template-thumb";
import { ActionForm, Submit } from "@/components/action-form";
import { createCampaign } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New campaign · Desk Frog Mail" };

export default async function NewCampaign({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const { workspace, user } = await requireSession();
  const { template: preset } = await searchParams;
  const brand = await brandFor(workspace.id);
  const [{ data: lists }, starters, saved] = await Promise.all([
    admin().from("lists").select("id, name").eq("workspace_id", workspace.id).order("name"),
    starterGallery(brand),
    savedGallery(workspace.id, brand),
  ]);
  const options = [...saved, ...starters];
  const selected = options.some((o) => o.key === preset) ? preset : "starter:newsletter";
  const shared = !workspace.plan.custom_domain;
  let sharedFrom = "";
  try { sharedFrom = `${workspace.slug}@${env.sharedSendingDomain}`; } catch { /* not configured yet */ }

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">New campaign</h1>
        <p className="text-muted">Set the basics, pick a starting point, then design it in the editor.</p>
      </header>
      <ActionForm action={createCampaign} className="card space-y-5 p-6">
        <div>
          <label className="label" htmlFor="name">Campaign name <span className="font-normal text-muted">(internal)</span></label>
          <input className="input" id="name" name="name" required placeholder="Round 4 entries open" />
        </div>
        <div>
          <label className="label" htmlFor="subject">Subject line</label>
          <input className="input" id="subject" name="subject" required placeholder="Entries are open, {{first_name|racer}} 🏁" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="from_name">From name</label>
            <input className="input" id="from_name" name="from_name" required defaultValue={workspace.name} />
          </div>
          <div>
            <label className="label" htmlFor="from_email">{shared ? "Reply-to email" : "From email"}</label>
            <input className="input" id="from_email" name="from_email" type="email" required defaultValue={user.email ?? ""} />
            {shared && sharedFrom && <p className="mt-1 text-xs text-muted">Free plan sends from {sharedFrom}; replies go to this address.</p>}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="list_id">Send to</label>
            <select className="input" id="list_id" name="list_id">
              <option value="">All subscribed contacts</option>
              {lists?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="tags">Only contacts tagged <span className="font-normal text-muted">(optional)</span></label>
            <input className="input" id="tags" name="tags" placeholder="competitor, 2026-season" />
          </div>
        </div>
        <fieldset>
          <legend className="label">Start from <a href="/app/templates" className="ml-2 text-xs font-normal text-frog-700 underline">Browse all</a></legend>
          <div className="grid max-h-[560px] grid-cols-2 gap-3 overflow-y-auto rounded-xl border border-line bg-soft p-3 sm:grid-cols-3">
            {options.map((t) => (
              <label key={t.key} className="cursor-pointer">
                <input type="radio" name="template" value={t.key} defaultChecked={t.key === selected} className="peer sr-only" />
                <span className="block h-full rounded-xl border-2 border-transparent bg-white p-2 transition-colors peer-checked:border-frog-700 peer-checked:bg-frog-50 peer-focus-visible:ring-2 peer-focus-visible:ring-frog hover:border-frog">
                  <TemplateThumb html={t.previewHtml} title={t.name} />
                  <span className="mt-2 block truncate text-sm font-semibold">{t.name}</span>
                  <span className="block truncate text-xs text-muted">{t.category === "Yours" ? "Your template" : t.category}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Submit pending="Creating…">Continue to design →</Submit>
      </ActionForm>
    </div>
  );
}
