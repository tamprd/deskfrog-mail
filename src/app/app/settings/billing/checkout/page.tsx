import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { PlanIcon } from "@/components/plan-icon";
import { Checkout } from "./checkout";

export const metadata = { title: "Checkout · Desk Frog Mail" };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { workspace, role } = await requireSession();
  const { plan: planId } = await searchParams;
  const db = admin();
  const [{ data: plan }, { data: w }] = await Promise.all([
    db.from("plans").select("id, name, price_cents, contact_limit, monthly_send_limit, square_monthly_id").eq("id", planId ?? "").gt("price_cents", 0).maybeSingle(),
    db.from("workspaces").select("square_subscription_id, subscription_status, contact_name").eq("id", workspace.id).single(),
  ]);
  if (!plan) redirect("/app/settings/plans");
  if (w?.square_subscription_id && !["CANCELED", "DEACTIVATED"].includes(w.subscription_status ?? "")) redirect("/app/settings/plans");
  let locationId = "";
  try {
    locationId = env.squareLocationId;
  } catch {
    /* not configured yet */
  }
  const ready = Boolean(env.squareApplicationId && locationId && plan.square_monthly_id);

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_380px]">
      <section className="card p-6">
        <Link href="/app/settings/plans" className="text-sm text-muted hover:underline">← Plans</Link>
        <div className="mt-3 flex items-center gap-4">
          <PlanIcon plan={plan.name} className="h-16 w-16" />
          <div>
            <h2 className="text-2xl font-bold">{plan.name}</h2>
            <p className="text-muted">{plan.contact_limit.toLocaleString("en-AU")} contacts · {plan.monthly_send_limit.toLocaleString("en-AU")} emails a month · no badge · your own domain</p>
          </div>
        </div>
        <ul className="mt-6 space-y-2 text-sm">
          <li>✓ Your plan changes straight away.</li>
          <li>✓ Billed in AUD, GST included. A tax receipt is emailed each time.</li>
          <li>✓ Cancel any time; you keep the plan until the end of the period you&apos;ve paid for.</li>
        </ul>
      </section>
      <section className="card p-6">
        <h2 className="font-semibold">Payment</h2>
        <div className="mt-4">
          {role !== "owner" ? (
            <p className="text-sm text-muted">Only the account owner can change the plan.</p>
          ) : ready ? (
            <Checkout
              plan={{ id: plan.id, name: plan.name }}
              price={plan.price_cents / 100}
              appId={env.squareApplicationId}
              locationId={locationId}
              sandbox={env.squareEnv !== "production"}
              billingName={w?.contact_name ?? undefined}
            />
          ) : (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-warn">Card payments aren&apos;t switched on yet. Email hello@deskfrog.studio to change plan.</p>
          )}
        </div>
      </section>
    </div>
  );
}
