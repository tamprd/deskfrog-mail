import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { usage } from "@/lib/workspace";
import { PlanIcon } from "@/components/plan-icon";
import { ActionForm, Submit } from "@/components/action-form";
import Link from "next/link";
import { changePlan } from "../billing/actions";

export const metadata = { title: "Plans · Desk Frog Mail" };

const FEATURES: [string, (p: { id: string }) => string | boolean][] = [
  ["Drag-and-drop editor & templates", () => true],
  ["Custom HTML emails", () => true],
  ["Opens, clicks & who opened", () => true],
  ["Resend to non-openers", () => true],
  ["API & webhooks", () => true],
  ["AI writing help", (p) => (p.id === "free" ? "10 / month" : p.id === "starter" ? "100 / month" : p.id === "growth" ? "300 / month" : "1,000 / month")],
  ["Remove Desk Frog badge", (p) => p.id !== "free"],
  ["Send from your own domain", (p) => p.id !== "free"],
  ["Automations", (p) => p.id === "growth" || p.id === "pro"],
  ["Priority support", (p) => p.id === "pro"],
];

export default async function Plans() {
  const { workspace } = await requireSession();
  const [use, { data: plans }, { data: w }] = await Promise.all([
    usage(workspace.id),
    admin().from("plans").select("id, name, price_cents, contact_limit, monthly_send_limit").lt("sort", 90).order("sort"),
    admin().from("workspaces").select("square_subscription_id, subscription_status, billing_cycle, cancel_at").eq("id", workspace.id).single(),
  ]);
  const subscribed = Boolean(w?.square_subscription_id) && !["CANCELED", "DEACTIVATED"].includes(w?.subscription_status ?? "");
  return (
    <section className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr>
              <th className="w-56 p-4" />
              {plans?.map((p) => {
                const current = p.id === workspace.plan.id;
                const fits = use.contacts <= p.contact_limit;
                return (
                  <th key={p.id} className={`p-4 text-left align-top ${current ? "bg-frog-50" : ""}`}>
                    <PlanIcon plan={p.name} className="h-12 w-12" />
                    <p className="mt-2 text-lg font-bold">{p.name}</p>
                    <p className="text-2xl font-extrabold tabular-nums">${p.price_cents / 100}<span className="text-xs font-medium text-muted">/mo</span></p>
                    <div className="mt-3 font-normal">
                      {current ? (
                        <span className="pill bg-frog-100 text-forest">Current plan</span>
                      ) : !fits ? (
                        <span className="text-xs text-muted">Too small for {use.contacts.toLocaleString("en-AU")} contacts</span>
                      ) : p.price_cents === 0 ? (
                        subscribed ? <Link href="/app/settings/billing" className="text-xs font-semibold text-muted hover:underline">Cancel paid plan</Link> : null
                      ) : subscribed ? (
                        <ActionForm action={changePlan}>
                          <input type="hidden" name="plan" value={p.id} />
                          <input type="hidden" name="cycle" value={w?.billing_cycle ?? "monthly"} />
                          <Submit className="btn-primary px-3 py-1.5 text-xs" pending="Switching…">Switch to {p.name}</Submit>
                        </ActionForm>
                      ) : (
                        <Link className="btn-primary px-3 py-1.5 text-xs" href={`/app/settings/billing/checkout?plan=${p.id}`}>Choose {p.name}</Link>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-line"><td className="p-4 font-medium">Subscribed contacts</td>{plans?.map((p) => <td key={p.id} className={`p-4 tabular-nums ${p.id === workspace.plan.id ? "bg-frog-50" : ""}`}>{p.contact_limit.toLocaleString("en-AU")}</td>)}</tr>
            <tr className="border-t border-line"><td className="p-4 font-medium">Emails per month</td>{plans?.map((p) => <td key={p.id} className={`p-4 tabular-nums ${p.id === workspace.plan.id ? "bg-frog-50" : ""}`}>{p.monthly_send_limit.toLocaleString("en-AU")}</td>)}</tr>
            {FEATURES.map(([label, f]) => (
              <tr key={label} className="border-t border-line">
                <td className="p-4 font-medium">{label}</td>
                {plans?.map((p) => {
                  const v = f(p);
                  return <td key={p.id} className={`p-4 ${p.id === workspace.plan.id ? "bg-frog-50" : ""}`}>{v === true ? <span className="text-frog-700">✓</span> : v === false ? <span className="text-muted">—</span> : v}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line p-4 text-xs text-muted">AUD per month, GST included. Pay yearly and get 2 months free. Plan changes apply straight away; the new price starts from your next bill. Over 15,000 contacts? Email hello@deskfrog.studio.</p>
    </section>
  );
}
