"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { usage } from "@/lib/workspace";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function loadWs(id: string) {
  const { data } = await admin()
    .from("workspaces")
    .select("id, name, square_customer_id, square_subscription_id, square_card_id, contact_email, subscription_status, cancel_at")
    .eq("id", id)
    .single();
  return data!;
}

async function variationFor(planId: string, cycle: "monthly" | "annual") {
  const { data: p } = await admin().from("plans").select("id, name, contact_limit, square_monthly_id, square_annual_id").eq("id", planId).single();
  if (!p) throw new Error("Unknown plan");
  const v = cycle === "annual" ? p.square_annual_id : p.square_monthly_id;
  if (!v) throw new Error("Billing isn't set up for this plan yet.");
  return { plan: p, variation: v as string };
}

/** First subscription: save the card, start the subscription, switch the plan straight away. */
export async function subscribe(input: { planId: string; cycle: "monthly" | "annual"; sourceId: string; verificationToken?: string }) {
  const { workspace, user, role } = await requireSession();
  if (role !== "owner") return { error: "Only the account owner can change billing." };
  try {
    const { plan, variation } = await variationFor(input.planId, input.cycle);
    const u = await usage(workspace.id);
    if (u.contacts > plan.contact_limit) return { error: `${plan.name} allows ${plan.contact_limit.toLocaleString("en-AU")} subscribed contacts; you have ${u.contacts.toLocaleString("en-AU")}.` };
    const ws = await loadWs(workspace.id);
    if (ws.square_subscription_id && !["CANCELED", "DEACTIVATED"].includes(ws.subscription_status ?? "")) return { error: "You already have a subscription. Change plan instead." };
    const sq = await import("@/lib/square");
    const customer = await sq.ensureCustomer(ws, ws.contact_email || user.email!);
    const card = await sq.saveCard(customer, input.sourceId, input.verificationToken);
    const sub = await sq.createSubscription(customer, card.id, variation);
    await admin()
      .from("workspaces")
      .update({
        plan_id: plan.id,
        billing_cycle: input.cycle,
        square_subscription_id: sub.id,
        square_card_id: card.id,
        subscription_status: sub.status,
        card_brand: card.card_brand,
        card_last4: card.last_4,
        card_exp: `${String(card.exp_month).padStart(2, "0")}/${String(card.exp_year).slice(-2)}`,
        cancel_at: null,
        status: "active",
      })
      .eq("id", workspace.id)
      .neq("status", "suspended");
    // Referral credit becomes real once the referred account pays.
    await admin().from("referral_credits").update({ status: "earned" }).eq("referred_id", workspace.id).eq("status", "pending");
    revalidatePath("/app", "layout");
    return { ok: true };
  } catch (e) {
    return { error: msg(e) };
  }
}

/** Switch between paid plans. Upgrades apply now; Square bills the new price from the next billing date. */
export async function changePlan(_prev: unknown, formData: FormData) {
  const { workspace, role } = await requireSession();
  if (role !== "owner") return { error: "Only the account owner can change billing." };
  const planId = String(formData.get("plan"));
  const cycle = formData.get("cycle") === "annual" ? "annual" : "monthly";
  try {
    const ws = await loadWs(workspace.id);
    if (!ws.square_subscription_id) return { error: "Add a card first." };
    const { plan, variation } = await variationFor(planId, cycle);
    const u = await usage(workspace.id);
    if (u.contacts > plan.contact_limit) return { error: `${plan.name} allows ${plan.contact_limit.toLocaleString("en-AU")} subscribed contacts; you have ${u.contacts.toLocaleString("en-AU")}.` };
    const { swapPlan } = await import("@/lib/square");
    await swapPlan(ws.square_subscription_id, variation);
    await admin().from("workspaces").update({ plan_id: plan.id, billing_cycle: cycle }).eq("id", workspace.id);
    revalidatePath("/app", "layout");
    return { ok: `Switched to ${plan.name}. The new price applies from your next bill.` };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function updateCard(input: { sourceId: string; verificationToken?: string }) {
  const { workspace, user, role } = await requireSession();
  if (role !== "owner") return { error: "Only the account owner can change billing." };
  try {
    const ws = await loadWs(workspace.id);
    const sq = await import("@/lib/square");
    const customer = await sq.ensureCustomer(ws, ws.contact_email || user.email!);
    const card = await sq.saveCard(customer, input.sourceId, input.verificationToken);
    if (ws.square_subscription_id) await sq.setSubscriptionCard(ws.square_subscription_id, card.id);
    await admin()
      .from("workspaces")
      .update({ square_card_id: card.id, card_brand: card.card_brand, card_last4: card.last_4, card_exp: `${String(card.exp_month).padStart(2, "0")}/${String(card.exp_year).slice(-2)}` })
      .eq("id", workspace.id);
    revalidatePath("/app/settings/billing");
    return { ok: true };
  } catch (e) {
    return { error: msg(e) };
  }
}

/** Cancel at the end of the paid period, then drop to Free. */
export async function cancelPlan() {
  const { workspace, role } = await requireSession();
  if (role !== "owner") return { error: "Only the account owner can change billing." };
  try {
    const ws = await loadWs(workspace.id);
    if (!ws.square_subscription_id) return { error: "No subscription to cancel." };
    const { cancelSubscription } = await import("@/lib/square");
    const r = await cancelSubscription(ws.square_subscription_id);
    const end = r.subscription.canceled_date ?? r.subscription.charged_through_date ?? new Date().toISOString().slice(0, 10);
    await admin().from("workspaces").update({ cancel_at: end, subscription_status: r.subscription.status }).eq("id", workspace.id);
    revalidatePath("/app/settings/billing");
    return { ok: `Cancelled. You keep ${workspace.plan.name} until ${new Date(end).toLocaleDateString("en-AU")}, then move to Free.` };
  } catch (e) {
    return { error: msg(e) };
  }
}
