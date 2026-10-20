import Link from "next/link";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { usage } from "@/lib/workspace";
import { PlanIcon } from "@/components/plan-icon";
import { env } from "@/lib/env";
import { ActionForm, Submit } from "@/components/action-form";
import { cancelPlan } from "./actions";
import { UpdateCard } from "./checkout/checkout";

export const metadata = { title: "Plan · Desk Frog Mail" };

export default async function Billing({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { workspace, role } = await requireSession();
  const { welcome } = await searchParams;
  const db = admin();
  const [use, { data: plan }, { data: w }] = await Promise.all([
    usage(workspace.id),
    db.from("plans").select("price_cents").eq("id", workspace.plan.id).single(),
    db.from("workspaces").select("contact_name, company, contact_email, abn, sender_address, billing_cycle, subscription_status, card_brand, card_last4, card_exp, cancel_at, paid_through, square_subscription_id").eq("id", workspace.id).single(),
  ]);
  const annual = w?.billing_cycle === "annual";
  const price = ((plan?.price_cents ?? 0) / 100) * (annual ? 10 : 1);
  let locationId = "";
  try { locationId = env.squareLocationId; } catch { /* not configured */ }
  const cardReady = Boolean(env.squareApplicationId && locationId);
  const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : null);
  const gst = Math.round((price / 11) * 100) / 100;
  const pct = Math.min(100, (use.contacts / workspace.plan.contact_limit) * 100);
  return (
    <div className="space-y-6">
    {welcome && <p className="rounded-lg bg-frog-50 p-4 text-sm font-semibold text-forest">You&apos;re on {workspace.plan.name} 🐸 Thanks for subscribing. Your receipt is on its way.</p>}
    {w?.subscription_status === "PAYMENT_FAILED" && <p className="rounded-lg bg-red-50 p-4 text-sm text-danger">Your last payment didn&apos;t go through. Update your card below to keep your plan.</p>}
    {w?.cancel_at && <p className="rounded-lg bg-amber-50 p-4 text-sm text-warn">Your plan is cancelled and moves to Free on {d(w.cancel_at)}. Choose a plan again any time.</p>}
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{price === 0 ? "Free" : annual ? "Yearly" : "Monthly"}</p>
            <h2 className="flex items-center gap-3 text-2xl font-bold"><PlanIcon plan={workspace.plan.name} className="h-10 w-10" />{workspace.plan.name}</h2>
            <p className="mt-2 text-3xl font-extrabold tabular-nums">${price}<span className="text-sm font-medium text-muted"> per {annual ? "year" : "month"}</span></p>
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
            <p className="mt-1 text-xs text-muted">AUD, GST included.{w?.paid_through ? ` Paid through ${d(w.paid_through)}.` : ""}</p>
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
        </section>
        <section className="card p-5 text-sm">
          <h2 className="font-semibold">Payment method</h2>
          {w?.card_last4 ? (
            <p className="mt-2"><span className="pill bg-soft font-semibold">{w.card_brand?.replace("_", " ")}</span> •••• {w.card_last4} <span className="text-muted">· expires {w.card_exp}</span></p>
          ) : (
            <p className="mt-2 text-muted">No card on file.</p>
          )}
          {role === "owner" && w?.square_subscription_id && cardReady && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-frog-700">Change card</summary>
              <div className="mt-3"><UpdateCard appId={env.squareApplicationId} locationId={locationId} sandbox={env.squareEnv !== "production"} billingName={w.contact_name ?? undefined} /></div>
            </details>
          )}
        </section>
        {role === "owner" && w?.square_subscription_id && !w.cancel_at && (
          <section className="card p-5 text-sm">
            <h2 className="font-semibold">Cancel plan</h2>
            <p className="mt-1 text-muted">You keep {workspace.plan.name} until the end of the period you&apos;ve paid for, then move to Free. Nothing is deleted.</p>
            <ActionForm action={cancelPlan} className="mt-3"><Submit className="btn-secondary text-xs" pending="Cancelling…">Cancel my plan</Submit></ActionForm>
          </section>
        )}
      </aside>
    </div>
    </div>
  );
}
