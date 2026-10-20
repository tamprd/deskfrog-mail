import Link from "next/link";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { allowedSenders } from "@/lib/senders";
import { brandFor, savedGallery, starterGallery } from "@/lib/email/gallery";
import { ContentChooser } from "@/components/content-chooser";
import { aiUsage } from "@/lib/ai/credits";
import { ActionForm, Submit } from "@/components/action-form";
import { createCampaign } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New campaign · Desk Frog Mail" };

export const maxDuration = 60; // AI writing can take a while

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
  const ai = await aiUsage(workspace.id, workspace.plan.id);
  const selected = options.some((o) => o.key === preset) ? preset : "starter:newsletter";
  const { senders, domains } = await allowedSenders(workspace.id, user.email);
  const shared = !workspace.plan.custom_domain || domains.length === 0;
  let sharedFrom = "";
  try { sharedFrom = `${workspace.slug}@${env.sharedSendingDomain}`; } catch { /* not configured yet */ }

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">New campaign</h1>
        <p className="text-muted">Set the basics, choose how you want to build it, then finish it in the editor.</p>
      </header>
      <ActionForm action={createCampaign} className="card space-y-5 p-6">
        <div>
          <label className="label" htmlFor="name">Campaign name <span className="font-normal text-muted">(internal)</span></label>
          <input className="input" id="name" name="name" required placeholder="Round 4 entries open" />
        </div>
        <div>
          <label className="label" htmlFor="subject">Subject line <span className="font-normal text-muted">(optional with AI or pasted HTML with a &lt;title&gt;)</span></label>
          <input className="input" id="subject" name="subject" placeholder="Entries are open, {{first_name|racer}} 🏁" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="from_name">From name</label>
            <input className="input" id="from_name" name="from_name" required defaultValue={workspace.name} />
          </div>
          <div>
            <label className="label" htmlFor="from_email">{shared ? "Reply-to email" : "From email"}</label>
            <select className="input" id="from_email" name="from_email" required defaultValue={senders[0]?.email}>
              {senders.map((x) => <option key={x.email} value={x.email}>{x.name ? `${x.name} <${x.email}>` : x.email}</option>)}
            </select>
            <p className="mt-1 text-xs"><Link href="/app/settings?tab=domains#senders" className="font-semibold text-frog-700 hover:underline">+ Add a sender address</Link></p>
            {shared && sharedFrom && (
              <p className="mt-1 text-xs text-muted">
                Sends from {sharedFrom} with replies to this address.
                {workspace.plan.custom_domain && <> <Link href="/app/settings?tab=domains#domains" className="font-semibold text-frog-700 hover:underline">Connect your domain</Link> to send as yourself and land in inboxes more reliably.</>}
              </p>
            )}
            {!shared && <p className="mt-1 text-xs text-muted">Use an address at {domains.join(" or ")} to send as yourself. Any other address sends via Desk Frog with replies to you.</p>}
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
        <ContentChooser
          options={options.map(({ key, name, category, previewHtml }) => ({ key, name, category, previewHtml }))}
          preset={selected ?? "starter:newsletter"}
          ai={ai}
        />
        <Submit pending="Creating… (AI emails take ~20s)">Continue →</Submit>
      </ActionForm>
    </div>
  );
}
