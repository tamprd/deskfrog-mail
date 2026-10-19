import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { ActionForm, Submit } from "@/components/action-form";
import { createCampaign } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New campaign · Desk Frog Mail" };

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
        <p className="text-muted">Saved as a draft. You&apos;ll review it before anything is sent.</p>
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
        <div>
          <label className="label" htmlFor="html">Content</label>
          <textarea className="input min-h-[280px] font-mono text-xs" id="html" name="html" required
            placeholder={"Hi {{first_name|there}},\n\nEntries for Round 4 are now open...\n\n(Plain text or HTML. Unsubscribe link and footer are added automatically.)"} />
          <p className="mt-1 text-xs text-muted">Merge tags: <code>{"{{first_name}}"}</code>, <code>{"{{last_name}}"}</code>, <code>{"{{email}}"}</code>, any custom field, with fallbacks like <code>{"{{first_name|there}}"}</code>.</p>
        </div>
        <Submit pending="Saving…">Save draft</Submit>
      </ActionForm>
    </div>
  );
}
