import Link from "next/link";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { dailyCap, usage } from "@/lib/workspace";
import { StatusPill } from "@/components/status";

export const dynamic = "force-dynamic";

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const tone = pct >= 90 ? "bg-danger" : pct >= 75 ? "bg-warn" : "bg-frog";
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums">
        {used.toLocaleString("en-AU")} <span className="text-base font-medium text-muted">/ {limit.toLocaleString("en-AU")}</span>
      </p>
      <div className="mt-3 h-2 rounded-full bg-frog-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function Dashboard() {
  const { workspace } = await requireSession();
  const u = await usage(workspace.id);
  const db = admin();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: campaigns }, { count: sent30 }, { count: opened30 }] = await Promise.all([
    db.from("campaigns").select("id, name, status, recipient_count, created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(5),
    db.from("messages").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).in("status", ["sent", "delivered"]).gte("created_at", since),
    db.from("messages").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).not("opened_at", "is", null).gte("created_at", since),
  ]);
  const openRate = sent30 ? Math.round(((opened30 ?? 0) / sent30) * 1000) / 10 : 0;
  const hour = Number(new Date().toLocaleString("en-AU", { hour: "numeric", hour12: false, timeZone: "Australia/Brisbane" }));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{greeting}!</h1>
          <p className="text-muted">Here&apos;s how {workspace.name} is tracking.</p>
        </div>
        <Link href="/app/campaigns/new" className="btn-primary">+ Create campaign</Link>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Meter label="Contacts" used={u.contacts} limit={workspace.plan.contact_limit} />
        <Meter label="Sends this month" used={u.sentThisMonth} limit={workspace.plan.monthly_send_limit} />
        <Meter label="Sends today" used={u.sentToday + u.queued} limit={dailyCap(workspace)} />
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Open rate · 30 days</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{openRate}%</p>
          <p className="mt-3 text-xs text-muted">{(sent30 ?? 0).toLocaleString("en-AU")} emails sent</p>
        </div>
      </section>

      {workspace.plan.badge_required && (
        <section className="card flex flex-wrap items-center justify-between gap-4 bg-frog-50 p-5">
          <div>
            <p className="font-semibold text-forest">You&apos;re on the Free plan</p>
            <p className="text-sm text-muted">Emails carry the 🐸 Desk Frog Mail badge and send from our shared domain. Upgrade to remove the badge and send from your own domain.</p>
          </div>
          <a className="btn-secondary" href="mailto:hello@deskfrog.studio?subject=Desk%20Frog%20Mail%20upgrade">Upgrade</a>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="font-semibold">Recent campaigns</h2>
          <Link href="/app/campaigns" className="text-sm font-semibold text-frog-700 hover:underline">View all →</Link>
        </div>
        {campaigns?.length ? (
          <table className="w-full">
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="td"><Link href={`/app/campaigns/${c.id}`} className="font-medium hover:underline">{c.name}</Link></td>
                  <td className="td"><StatusPill status={c.status} /></td>
                  <td className="td text-right text-muted tabular-nums">{c.recipient_count ? `${c.recipient_count.toLocaleString("en-AU")} recipients` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="border-t border-line px-5 py-10 text-center text-muted">No campaigns yet. Add some contacts, then create your first one.</p>
        )}
      </section>
    </div>
  );
}
