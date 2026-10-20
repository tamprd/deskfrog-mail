import Link from "next/link";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { usage } from "@/lib/workspace";
import { PlanIcon } from "@/components/plan-icon";
import { DEFAULT_BRAND, type Brand } from "@/lib/email/design";

export default async function Overview() {
  const { workspace } = await requireSession();
  const db = admin();
  const [use, { data: senders }, { data: domains }, { data: wsRow }, sent, lists] = await Promise.all([
    usage(workspace.id),
    db.from("sender_addresses").select("ses_verified_at").eq("workspace_id", workspace.id),
    db.from("sending_domains").select("status").eq("workspace_id", workspace.id),
    db.from("workspaces").select("brand").eq("id", workspace.id).single(),
    db.from("campaigns").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).in("status", ["sending", "sent"]),
    db.from("lists").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
  ]);
  const brand = { ...DEFAULT_BRAND, ...((wsRow?.brand ?? {}) as Partial<Brand>) };
  const readySenders = (senders ?? []).filter((x) => x.ses_verified_at).length;
  const verifiedDomains = (domains ?? []).filter((d) => d.status === "verified").length;
  const bar = (n: number, max: number) => (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-frog-50"><div className="h-full rounded-full bg-frog" style={{ width: `${Math.min(100, max ? (n / max) * 100 : 0)}%` }} /></div>
  );

  return (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="card flex items-center gap-4 p-5">
              <PlanIcon plan={workspace.plan.name} className="h-14 w-14" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Plan</p>
                <p className="text-xl font-bold">{workspace.plan.name}</p>
                <Link href="/app/settings/billing" className="text-xs font-semibold text-frog-700 hover:underline">Change plan</Link>
              </div>
            </div>
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Subscribed contacts</p>
              <p className="text-xl font-bold tabular-nums">{use.contacts.toLocaleString("en-AU")} <span className="text-sm font-medium text-muted">/ {workspace.plan.contact_limit.toLocaleString("en-AU")}</span></p>
              {bar(use.contacts, workspace.plan.contact_limit)}
            </div>
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Sends this month</p>
              <p className="text-xl font-bold tabular-nums">{use.sentThisMonth.toLocaleString("en-AU")} <span className="text-sm font-medium text-muted">/ {workspace.plan.monthly_send_limit.toLocaleString("en-AU")}</span></p>
              {bar(use.sentThisMonth, workspace.plan.monthly_send_limit)}
            </div>
          </section>
          <section className="card p-6">
            <h2 className="font-semibold">Getting set up</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                [readySenders > 0, "Confirm the email address you send from", "/app/settings/domains"],
                [Boolean(workspace.sender_address), "Add your postal address (shown in email footers)", "/app/settings/details"],
                [Boolean(brand.logoUrl), "Upload your logo and colours", "/app/settings/details"],
                [verifiedDomains > 0, "Connect your domain (optional, better inbox placement)", "/app/settings/domains"],
              ].map(([done, label, t]) => (
                <li key={String(label)} className="flex items-center gap-3">
                  <span className={`grid h-5 w-5 place-items-center rounded-full text-xs ${done ? "bg-frog-700 text-white" : "border border-line text-transparent"}`}>✓</span>
                  {done ? <span className="text-muted line-through">{label}</span> : <Link href={String(t)} className="font-medium hover:underline">{label}</Link>}
                </li>
              ))}
            </ul>
          </section>
          <section className="card p-6">
            <h2 className="font-semibold">What you&apos;ve built</h2>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                [use.contacts, "Subscribed contacts", "/app/contacts"],
                [sent.count ?? 0, "Campaigns sent", "/app/campaigns"],
                [lists.count ?? 0, "Lists", "/app/contacts"],
                [use.sentThisMonth, "Emails this month", "/app/campaigns"],
              ].map(([n, label, href]) => (
                <Link key={String(label)} href={String(href)} className="rounded-lg p-2 hover:bg-frog-50">
                  <p className="text-2xl font-bold tabular-nums">{Number(n).toLocaleString("en-AU")}</p>
                  <p className="text-xs text-muted">{label}</p>
                </Link>
              ))}
            </div>
          </section>
        </>
  );
}
