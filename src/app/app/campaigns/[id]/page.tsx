import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { footerHtml, merge, withFooter } from "@/lib/render";
import { remainingSends } from "@/lib/workspace";
import { ActionForm, Submit } from "@/components/action-form";
import { StatusPill } from "@/components/status";
import { deleteDraft, duplicateCampaign, sendCampaign } from "../../actions";

export const dynamic = "force-dynamic";

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{typeof value === "number" ? value.toLocaleString("en-AU") : value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace, user } = await requireSession();
  const db = admin();
  const { data: c } = await db
    .from("campaigns")
    .select("*, list:lists(name)")
    .eq("workspace_id", workspace.id)
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const draft = c.status === "draft";
  const { data: stats } = draft ? { data: null } : await db.rpc("campaign_stats", { cid: id }).single<Record<string, number>>();
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : "—");

  // Preview with sample merge data
  const sample = { email: user.email ?? "you@example.com", first_name: "Alex", last_name: "Sample", unsub_token: "preview" };
  const preview = withFooter(
    merge(c.html, sample),
    footerHtml({ senderName: c.from_name, senderAddress: workspace.sender_address, unsubToken: "preview", badge: workspace.plan.badge_required }),
  );

  // Rough audience size for the confirm step
  let audience = 0;
  let remaining = 0;
  if (draft) {
    let q = db.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "subscribed");
    if (c.tag_filter?.length) q = q.contains("tags", c.tag_filter);
    if (c.list_id) {
      const { count } = await db.from("list_members").select("contact_id", { count: "exact", head: true }).eq("list_id", c.list_id).eq("status", "subscribed");
      audience = count ?? 0;
    } else {
      audience = (await q).count ?? 0;
    }
    remaining = await remainingSends(workspace);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/app/campaigns" className="text-sm text-muted hover:underline">← Campaigns</Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{c.name}</h1>
          <p className="text-muted">{c.subject}</p>
        </div>
        <StatusPill status={c.status} />
      </header>

      {stats && (
        <section className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          <Stat label="Recipients" value={stats.recipients} />
          <Stat label="Delivered" value={stats.delivered} sub={pct(stats.delivered, stats.sent)} />
          <Stat label="Opened" value={stats.opened} sub={pct(stats.opened, stats.delivered || stats.sent)} />
          <Stat label="Clicked" value={stats.clicked} sub={pct(stats.clicked, stats.delivered || stats.sent)} />
          <Stat label="Bounced / unsub" value={`${stats.bounced} / ${stats.unsubscribed}`} />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-3 text-sm">
            <p><span className="text-muted">From:</span> {c.from_name} &lt;{c.from_email}&gt;</p>
            <p><span className="text-muted">To:</span> {c.list?.name ?? "All subscribed contacts"}{c.tag_filter?.length ? ` tagged ${c.tag_filter.join(", ")}` : ""}</p>
          </div>
          <iframe title="Email preview" srcDoc={preview} sandbox="" className="h-[560px] w-full bg-white" />
        </section>

        {draft ? (
          <aside className="space-y-4">
            <Link href={`/editor/${c.id}`} className="btn-primary w-full">✏️ Edit design</Link>
            <ActionForm action={sendCampaign} className="card p-5">
              <input type="hidden" name="id" value={c.id} />
              <h2 className="font-semibold">Ready to send?</h2>
              <p className="mt-1 text-sm text-muted">
                About <strong className="text-ink">{audience.toLocaleString("en-AU")}</strong> subscribed contacts match.
                You can send <strong className="text-ink">{remaining.toLocaleString("en-AU")}</strong> more today on your plan.
              </p>
              {audience > remaining && <p className="mt-2 text-sm text-warn">This is over your remaining allowance — the send will be refused.</p>}
              <Submit className="btn-secondary mt-4 w-full" pending="Queuing…">Send now</Submit>
            </ActionForm>
            <form action={deleteDraft}>
              <input type="hidden" name="id" value={c.id} />
              <button className="btn-danger w-full">Delete draft</button>
            </form>
          </aside>
        ) : (
          <aside>
            <form action={duplicateCampaign}>
              <input type="hidden" name="id" value={c.id} />
              <button className="btn-secondary w-full">Duplicate as new draft</button>
            </form>
          </aside>
        )}
      </div>
    </div>
  );
}
