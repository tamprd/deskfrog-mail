import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { admin } from "@/lib/supabase/admin";

/** Square REST API (no SDK). Prices are AUD and include GST. */
const VERSION = "2026-09-16";
const base = () => (env.squareEnv === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com");

export class SquareError extends Error {}

export async function sq<T = Record<string, unknown>>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.squareAccessToken}`,
      "Square-Version": VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { errors?: { detail?: string; code?: string }[] } & T;
  if (!res.ok || json.errors?.length) {
    const e = json.errors?.[0];
    throw new SquareError(e?.detail || e?.code || `Square ${res.status}`);
  }
  return json;
}

type Plan = { id: string; name: string; price_cents: number; square_plan_id: string | null; square_monthly_id: string | null; square_annual_id: string | null };

/** Create the Square subscription plan + monthly and annual variations for every paid plan (idempotent). */
export async function syncPlans() {
  const db = admin();
  const { data: plans } = await db.from("plans").select("id, name, price_cents, square_plan_id, square_monthly_id, square_annual_id").gt("price_cents", 0).lt("sort", 90);
  const out: Record<string, unknown> = {};
  for (const p of (plans ?? []) as Plan[]) {
    let planId = p.square_plan_id;
    if (!planId) {
      const r = await sq<{ catalog_object: { id: string } }>("/v2/catalog/object", "POST", {
        idempotency_key: randomUUID(),
        object: { type: "SUBSCRIPTION_PLAN", id: `#plan-${p.id}`, present_at_all_locations: true, subscription_plan_data: { name: `Desk Frog Mail ${p.name}` } },
      });
      planId = r.catalog_object.id;
    }
    const variation = async (cadence: "MONTHLY" | "ANNUAL", cents: number, label: string) => {
      const r = await sq<{ catalog_object: { id: string } }>("/v2/catalog/object", "POST", {
        idempotency_key: randomUUID(),
        object: {
          type: "SUBSCRIPTION_PLAN_VARIATION",
          id: `#var-${p.id}-${cadence}`,
          present_at_all_locations: true,
          subscription_plan_variation_data: {
            name: `${p.name} ${label}`,
            subscription_plan_id: planId,
            phases: [{ cadence, ordinal: 0, pricing: { type: "STATIC", price: { amount: cents, currency: "AUD" } } }],
          },
        },
      });
      return r.catalog_object.id;
    };
    const monthly = p.square_monthly_id ?? (await variation("MONTHLY", p.price_cents, "monthly"));
    const annual = p.square_annual_id ?? (await variation("ANNUAL", p.price_cents * 10, "yearly"));
    await db.from("plans").update({ square_plan_id: planId, square_monthly_id: monthly, square_annual_id: annual }).eq("id", p.id);
    out[p.id] = { planId, monthly, annual };
  }
  return out;
}

export async function ensureCustomer(ws: { id: string; name: string; square_customer_id: string | null }, email: string) {
  if (ws.square_customer_id) return ws.square_customer_id;
  const r = await sq<{ customer: { id: string } }>("/v2/customers", "POST", {
    idempotency_key: `ws-${ws.id}`,
    email_address: email,
    company_name: ws.name.slice(0, 100),
    reference_id: ws.id,
  });
  await admin().from("workspaces").update({ square_customer_id: r.customer.id }).eq("id", ws.id);
  return r.customer.id;
}

export async function saveCard(customerId: string, sourceId: string, verificationToken?: string) {
  const r = await sq<{ card: { id: string; card_brand: string; last_4: string; exp_month: number; exp_year: number } }>("/v2/cards", "POST", {
    idempotency_key: randomUUID(),
    source_id: sourceId,
    verification_token: verificationToken || undefined,
    card: { customer_id: customerId },
  });
  return r.card;
}

export type SquareSubscription = { id: string; status: string; plan_variation_id: string; charged_through_date?: string; canceled_date?: string; customer_id: string };

export async function createSubscription(customerId: string, cardId: string, variationId: string) {
  const r = await sq<{ subscription: SquareSubscription }>("/v2/subscriptions", "POST", {
    idempotency_key: randomUUID(),
    location_id: env.squareLocationId,
    plan_variation_id: variationId,
    customer_id: customerId,
    card_id: cardId,
    timezone: "Australia/Brisbane",
    source: { name: "Desk Frog Mail" },
  });
  return r.subscription;
}

/** Change plan from the next billing date. */
export const swapPlan = (subscriptionId: string, variationId: string) =>
  sq(`/v2/subscriptions/${subscriptionId}/swap-plan`, "POST", { new_plan_variation_id: variationId });

/** Cancels at the end of the period already paid for. */
export const cancelSubscription = (subscriptionId: string) => sq<{ subscription: SquareSubscription }>(`/v2/subscriptions/${subscriptionId}/cancel`, "POST", {});

export const setSubscriptionCard = (subscriptionId: string, cardId: string) =>
  sq(`/v2/subscriptions/${subscriptionId}`, "PUT", { subscription: { card_id: cardId } });

export const getSubscription = (id: string) => sq<{ subscription: SquareSubscription }>(`/v2/subscriptions/${id}`).then((r) => r.subscription);

/** x-square-hmacsha256-signature = base64(HMAC-SHA256(key, notificationUrl + rawBody)). */
export function validSignature(rawBody: string, signature: string | null, notificationUrl: string) {
  if (!signature) return false;
  const want = Buffer.from(createHmac("sha256", env.squareWebhookKey).update(notificationUrl + rawBody).digest("base64"));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Which of our plans does a Square variation belong to? */
export async function planForVariation(variationId: string) {
  const { data } = await admin()
    .from("plans")
    .select("id, square_monthly_id, square_annual_id")
    .or(`square_monthly_id.eq.${variationId},square_annual_id.eq.${variationId}`)
    .maybeSingle();
  if (!data) return null;
  return { planId: data.id as string, cycle: (data.square_annual_id === variationId ? "annual" : "monthly") as "monthly" | "annual" };
}
