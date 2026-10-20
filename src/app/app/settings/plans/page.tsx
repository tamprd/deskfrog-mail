import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { usage } from "@/lib/workspace";
import { PlanIcon } from "@/components/plan-icon";

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
  const [use, { data: plans }] = await Promise.all([
    usage(workspace.id),
    admin().from("plans").select("id, name, price_cents, contact_limit, monthly_send_limit").lt("sort", 90).order("sort"),
  ]);
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
                      ) : fits ? (
                        <a className="btn-primary px-3 py-1.5 text-xs" href={`mailto:hello@deskfrog.studio?subject=${encodeURIComponent(`Change ${workspace.name} to ${p.name}`)}`}>Switch to {p.name}</a>
                      ) : (
                        <span className="text-xs text-muted">Too small for {use.contacts.toLocaleString("en-AU")} contacts</span>
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
      <p className="border-t border-line p-4 text-xs text-muted">AUD per month, GST included. Pay yearly and get 2 months free. Over 25,000 contacts? Email hello@deskfrog.studio.</p>
    </section>
  );
}
