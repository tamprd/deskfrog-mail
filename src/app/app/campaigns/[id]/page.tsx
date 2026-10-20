import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { footerHtml, footerText, merge, withFooter } from "@/lib/render";
import { remainingSends } from "@/lib/workspace";
import { ActionForm, Submit } from "@/components/action-form";
import { StatusPill } from "@/components/status";
import { createResend, deleteDraft, duplicateCampaign, sendCampaign } from "../../actions";
import { isFilter } from "@/lib/recipients";
import { Recipients } from "./recipients";
import { Links } from "./links";

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

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; filter?: string; q?: string; page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab === "recipients" || sp.tab === "links" ? sp.tab : "overview";
  const { workspace, user } = await requireSession();
  const db = admin();
  const { data: c } = await db
    .from("campaigns")
    .select("*, list:lists(name), original:campaigns!campaigns_resend_of_fkey(id, name)")
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
  if (draft && c.resend_of) {
    // Resend: people who got the original but haven't opened or clicked it (unsubscribes are excluded at send time).
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.resend_of)
      .in("status", ["sent", "delivered"])
      .is("opened_at", null)
      .is("clicked_at", null);
    audience = count ?? 0;
    remaining = await remainingSends(workspace);
  } else if (draft) {
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
          {c.original && (
            <p className="mt-1 text-sm">
              <span className="pill bg-teal/10 text-teal-700">↻ Resend</span>{" "}
              <span className="text-muted">to people who didn&apos;t open </span>
              <Link href={`/app/campaigns/${c.original.id}`} className="font-medium hover:underline">{c.original.name}</Link>
            </p>
          )}
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

      {!draft && (
        <nav className="flex gap-1 border-b border-line" aria-label="Campaign sections">
          {([["overview", "Overview"], ["recipients", "Recipients"], ["links", "Link clicks"]] as const).map(([key, label]) => (
            <Link
              key={key}
              href={key === "overview" ? `/app/campaigns/${c.id}` : `?tab=${key}`}
              aria-current={tab === key ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === key ? "border-frog-700 text-forest" : "border-transparent text-muted hover:text-ink"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}

      {!draft && tab === "recipients" && (
        <Recipients campaignId={c.id} filter={isFilter(sp.filter) ? sp.filter : "all"} q={sp.q} page={Math.max(1, Number(sp.page) || 1)} />
      )}
      {!draft && tab === "links" && <Links campaignId={c.id} />}

      {(draft || tab === "overview") && (
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-3 text-sm">
            <p><span className="text-muted">From:</span> {c.from_name} &lt;{c.from_email}&gt;</p>
            <p><span className="text-muted">To:</span> {c.list?.name ?? "All subscribed contacts"}{c.tag_filter?.length ? ` tagged ${c.tag_filter.join(", ")}` : ""}</p>
          </div>
          {c.format === "text" ? (
            <pre className="h-[560px] overflow-auto whitespace-pre-wrap bg-white p-6 font-mono text-sm">{merge(c.text ?? "", sample, true) + footerText({ senderName: c.from_name, senderAddress: workspace.sender_address, unsubToken: "preview", badge: workspace.plan.badge_required })}</pre>
          ) : (
            <iframe title="Email preview" srcDoc={preview} sandbox="" className="h-[560px] w-full bg-white" />
          )}
        </section>

        {draft ? (
          <aside className="space-y-4">
            <Link href={`/editor/${c.id}`} className="btn-primary w-full">✏️ {c.format === "html" ? "Edit HTML" : c.format === "text" ? "Edit text" : "Edit design"}</Link>
            <ActionForm action={sendCampaign} className="card p-5">
              <input type="hidden" name="id" value={c.id} />
              <h2 className="font-semibold">Ready to send?</h2>
              <p className="mt-1 text-sm text-muted">
                About <strong className="text-ink">{audience.toLocaleString("en-AU")}</strong> {c.resend_of ? "people didn't open the original." : "subscribed contacts match."}
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
          <aside className="space-y-3">
            {stats && !c.resend_of && (
              <form action={createResend} className="card p-5">
                <input type="hidden" name="id" value={c.id} />
                <h2 className="font-semibold">↻ Resend to non-openers</h2>
                <p className="mt-1 text-sm text-muted">
                  <strong className="text-ink">{Math.max(0, stats.sent - stats.opened - stats.bounced - stats.complained).toLocaleString("en-AU")}</strong> people haven&apos;t opened it yet.
                  Creates a draft copy just for them — try a new subject line. Best sent 2–4 days after the original.
                </p>
                <button className="btn-primary mt-4 w-full">Create resend</button>
              </form>
            )}
            <form action={duplicateCampaign}>
              <input type="hidden" name="id" value={c.id} />
              <button className="btn-secondary w-full">Duplicate as new draft</button>
            </form>
            <Link href="?tab=recipients&filter=clicked" className="btn-secondary w-full">See who clicked</Link>
          </aside>
        )}
      </div>
      )}
    </div>
  );
}
