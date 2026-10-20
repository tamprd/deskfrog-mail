import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { admin } from "@/lib/supabase/admin";
import { planForVariation, sq, validSignature, type SquareSubscription } from "@/lib/square";

export const runtime = "nodejs";

type Event = { type: string; event_id: string; data: { id: string; object: Record<string, unknown> } };

/** Square → us: keep each account's plan in step with its subscription, and record paid invoices. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const url = `${env.appUrl}/api/square/webhook`;
  if (!validSignature(raw, req.headers.get("x-square-hmacsha256-signature"), url)) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }
  const ev = JSON.parse(raw) as Event;
  const db = admin();

  if (ev.type === "subscription.created" || ev.type === "subscription.updated") {
    const s = ev.data.object.subscription as SquareSubscription;
    const { data: ws } = await db.from("workspaces").select("id").eq("square_subscription_id", s.id).maybeSingle();
    if (ws) {
      const update: Record<string, unknown> = { subscription_status: s.status, paid_through: s.charged_through_date ?? null };
      if (s.canceled_date) update.cancel_at = s.canceled_date;
      if (s.status === "ACTIVE") {
        const p = await planForVariation(s.plan_variation_id);
        if (p) Object.assign(update, { plan_id: p.planId, billing_cycle: p.cycle });
      }
      if (s.status === "CANCELED" || s.status === "DEACTIVATED") Object.assign(update, { plan_id: "free", square_subscription_id: null });
      await db.from("workspaces").update(update).eq("id", ws.id);
    }
  }

  if (ev.type === "invoice.payment_made") {
    const inv = ev.data.object.invoice as {
      id: string;
      subscription_id?: string;
      invoice_number?: string;
      title?: string;
      payment_requests?: { computed_amount_money?: { amount: number }; total_completed_amount_money?: { amount: number } }[];
      order_id?: string;
      public_url?: string;
    };
    const { data: ws } = inv.subscription_id ? await db.from("workspaces").select("id").eq("square_subscription_id", inv.subscription_id).maybeSingle() : { data: null };
    if (ws) {
      const amount = inv.payment_requests?.[0]?.total_completed_amount_money?.amount ?? inv.payment_requests?.[0]?.computed_amount_money?.amount ?? 0;
      let receipt: string | null = inv.public_url ?? null;
      let paymentId: string | null = null;
      try {
        if (inv.order_id) {
          const o = await sq<{ order: { tenders?: { payment_id?: string }[] } }>(`/v2/orders/${inv.order_id}`);
          paymentId = o.order.tenders?.[0]?.payment_id ?? null;
          if (paymentId) receipt = (await sq<{ payment: { receipt_url?: string } }>(`/v2/payments/${paymentId}`)).payment.receipt_url ?? receipt;
        }
      } catch {
        /* receipt link is a nice-to-have */
      }
      await db.from("invoices").upsert(
        {
          workspace_id: ws.id,
          square_invoice_id: inv.id,
          square_payment_id: paymentId,
          description: inv.title || `Desk Frog Mail ${inv.invoice_number ?? ""}`.trim(),
          amount_cents: amount,
          status: "paid",
          paid_at: new Date().toISOString(),
          receipt_url: receipt,
        },
        { onConflict: "square_invoice_id" },
      );
    }
  }

  if (ev.type === "invoice.scheduled_charge_failed" || ev.type === "invoice.payment_failed") {
    const inv = ev.data.object.invoice as { subscription_id?: string };
    if (inv?.subscription_id) await db.from("workspaces").update({ subscription_status: "PAYMENT_FAILED" }).eq("square_subscription_id", inv.subscription_id);
  }

  return NextResponse.json({ ok: true });
}
