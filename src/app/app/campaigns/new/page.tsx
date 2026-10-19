import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { STARTER_TEMPLATES } from "@/lib/email/templates";
import { ActionForm, Submit } from "@/components/action-form";
import { createCampaign } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New campaign · Desk Frog Mail" };

const ICON: Record<string, string> = { blank: "📄", newsletter: "📰", event: "🏁", results: "🏆", announcement: "📣" };

export default async function NewCampaign() {
  const { workspace, user } = await requireSession();
  const { data: lists } = await admin().from("lists").select("id, name").eq("workspace_id", workspace.id).order("name");
  const shared = !workspace.plan.custom_domain;
  let sharedFrom = "";
  try { sharedFrom = `${workspace.slug}@${env.sharedSendingDomain}`; } catch { /* not configured yet */ }

  return (
    <div className="max-w-3xl space-y-6">
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
          <legend className="label">Start from</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {STARTER_TEMPLATES.map((t, i) => (
              <label key={t.id} className="cursor-pointer">
                <input type="radio" name="template" value={t.id} defaultChecked={i === 1} className="peer sr-only" />
                <span className="block h-full rounded-xl border-2 border-line bg-white p-4 transition-colors peer-checked:border-frog-700 peer-checked:bg-frog-50 peer-focus-visible:ring-2 peer-focus-visible:ring-frog hover:border-frog">
                  <span className="text-2xl" aria-hidden>{ICON[t.id]}</span>
                  <span className="mt-1 block font-semibold">{t.name}</span>
                  <span className="block text-xs text-muted">{t.description}</span>
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
