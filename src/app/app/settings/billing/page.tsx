import Link from "next/link";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { usage } from "@/lib/workspace";
import { PlanIcon } from "@/components/plan-icon";

export const metadata = { title: "Plan · Desk Frog Mail" };

export default async function Billing() {
  const { workspace } = await requireSession();
  const db = admin();
  const [use, { data: plan }, { data: w }] = await Promise.all([
    usage(workspace.id),
    db.from("plans").select("price_cents").eq("id", workspace.plan.id).single(),
    db.from("workspaces").select("contact_name, company, contact_email, abn, sender_address").eq("id", workspace.id).single(),
  ]);
  const price = (plan?.price_cents ?? 0) / 100;
  const gst = Math.round((price / 11) * 100) / 100;
  const pct = Math.min(100, (use.contacts / workspace.plan.contact_limit) * 100);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Monthly</p>
            <h2 className="flex items-center gap-3 text-2xl font-bold"><PlanIcon plan={workspace.plan.name} className="h-10 w-10" />{workspace.plan.name}</h2>
            <p className="mt-2 text-3xl font-extrabold tabular-nums">${price}<span className="text-sm font-medium text-muted"> per month</span></p>
          </div>
          <Link href="/app/settings/plans" className="btn-secondary">Change plan</Link>
        </div>
        <div className="mt-6">
          <div className="flex justify-between text-sm"><span>Subscribed contacts</span><span className="tabular-nums">{use.contacts.toLocaleString("en-AU")} of {workspace.plan.contact_limit.toLocaleString("en-AU")}</span></div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-frog-50"><div className={`h-full rounded-full ${pct > 90 ? "bg-warn" : "bg-forest"}`} style={{ width: `${pct}%` }} /></div>
          <p className="mt-2 text-sm text-muted">{Math.max(0, workspace.plan.contact_limit - use.contacts).toLocaleString("en-AU")} remaining. Unsubscribed and bounced contacts don&apos;t count.</p>
        </div>
        <div className="mt-5">
          <div className="flex justify-between text-sm"><span>Emails this month</span><span className="tabular-nums">{use.sentThisMonth.toLocaleString("en-AU")} of {workspace.plan.monthly_send_limit.toLocaleString("en-AU")}</span></div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-frog-50"><div className="h-full rounded-full bg-forest" style={{ width: `${Math.min(100, (use.sentThisMonth / workspace.plan.monthly_send_limit) * 100)}%` }} /></div>
        </div>
      </section>
      <aside className="space-y-6">
        <section className="card overflow-hidden">
          <div className="bg-soft p-5">
            <p className="text-sm font-semibold">Next bill estimate</p>
            <p className="text-3xl font-extrabold tabular-nums">${price.toFixed(2)}</p>
            <p className="mt-1 text-xs text-muted">AUD, GST included.</p>
          </div>
          <dl className="space-y-2 p-5 text-sm">
            <div className="flex justify-between"><dt>{workspace.plan.name} plan</dt><dd className="tabular-nums">${(price - gst).toFixed(2)}</dd></div>
            <div className="flex justify-between"><dt>GST</dt><dd className="tabular-nums">${gst.toFixed(2)}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Total</dt><dd className="tabular-nums">${price.toFixed(2)}</dd></div>
          </dl>
        </section>
        <section className="card p-5 text-sm">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Billing information</h2><Link href="/app/settings/details" className="text-xs font-semibold text-frog-700 hover:underline">Change</Link></div>
          <p className="mt-2">{w?.contact_name || "—"}<br />{w?.company}<br />{w?.contact_email}<br />{w?.sender_address}</p>
          {w?.abn && <p className="mt-1 text-muted">ABN {w.abn}</p>}
          <p className="mt-3 text-xs text-muted">Card payments are coming soon. Until then, plan changes are handled by the Desk Frog team and invoiced.</p>
        </section>
      </aside>
    </div>
  );
}
