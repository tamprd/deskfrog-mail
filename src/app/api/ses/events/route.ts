import { NextResponse, type NextRequest } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { verifySns, type SnsMessage } from "@/lib/sns";
import { checkReputation, suppressAddress } from "@/lib/suppress";
import { emit } from "@/lib/webhooks";

export const runtime = "nodejs";

type SesEvent = {
  eventType: string;
  mail: { messageId: string; destination: string[]; tags?: Record<string, string[]> };
  bounce?: { bounceType: "Permanent" | "Transient" | "Undetermined"; bounceSubType: string; bouncedRecipients: { emailAddress: string; diagnosticCode?: string }[] };
  complaint?: { complainedRecipients: { emailAddress: string }[]; complaintFeedbackType?: string };
  open?: { timestamp: string; userAgent?: string };
  click?: { timestamp: string; link: string };
  delivery?: { timestamp: string };
  reject?: { reason: string };
};

/** SES configuration-set events arrive here via SNS (HTTPS subscription). */
export async function POST(req: NextRequest) {
  let sns: SnsMessage;
  try {
    sns = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!(await verifySns(sns))) return NextResponse.json({ error: "bad signature" }, { status: 403 });

  if (sns.Type === "SubscriptionConfirmation" && sns.SubscribeURL) {
    await fetch(sns.SubscribeURL);
    return NextResponse.json({ ok: true, confirmed: true });
  }
  if (sns.Type !== "Notification") return NextResponse.json({ ok: true });

  const ev: SesEvent = JSON.parse(sns.Message);
  await handle(ev);
  return NextResponse.json({ ok: true });
}

async function handle(ev: SesEvent) {
  const db = admin();
  const { data: m } = await db
    .from("messages")
    .select("id, workspace_id, contact_id, campaign_id, to_email, opened_at, clicked_at")
    .eq("ses_message_id", ev.mail.messageId)
    .maybeSingle();
  if (!m) return; // not ours, or already purged

  const base = { message_id: m.id, campaign_id: m.campaign_id, contact_id: m.contact_id, to: m.to_email };
  const log = (type: string, data: Record<string, unknown> = {}) =>
    db.from("events").insert({ workspace_id: m.workspace_id, message_id: m.id, contact_id: m.contact_id, type, data });

  switch (ev.eventType) {
    case "Delivery": {
      await db.from("messages").update({ status: "delivered", delivered_at: ev.delivery?.timestamp ?? new Date().toISOString() }).eq("id", m.id).in("status", ["sent", "sending"]);
      await log("delivered");
      await emit(m.workspace_id, "email.delivered", base);
      break;
    }
    case "Bounce": {
      const permanent = ev.bounce?.bounceType === "Permanent";
      await log("bounce", { type: ev.bounce?.bounceType, subtype: ev.bounce?.bounceSubType, diagnostic: ev.bounce?.bouncedRecipients?.[0]?.diagnosticCode });
      if (permanent) {
        await db.from("messages").update({ status: "bounced" }).eq("id", m.id);
        await suppressAddress(m.workspace_id, m.to_email, "bounce");
        await checkReputation(m.workspace_id);
      }
      await emit(m.workspace_id, "email.bounced", { ...base, permanent, type: ev.bounce?.bounceType, subtype: ev.bounce?.bounceSubType });
      break;
    }
    case "Complaint": {
      await db.from("messages").update({ status: "complained" }).eq("id", m.id);
      await log("complaint", { feedback: ev.complaint?.complaintFeedbackType });
      await suppressAddress(m.workspace_id, m.to_email, "complaint");
      await checkReputation(m.workspace_id);
      await emit(m.workspace_id, "email.complained", base);
      break;
    }
    case "Open": {
      if (!m.opened_at) await db.from("messages").update({ opened_at: ev.open?.timestamp }).eq("id", m.id);
      await log("open", { user_agent: ev.open?.userAgent });
      await emit(m.workspace_id, "email.opened", base);
      break;
    }
    case "Click": {
      // Ignore SES tracking of our own unsubscribe link; that's recorded as an unsubscribe.
      if (ev.click?.link?.includes("/u/")) break;
      if (!m.clicked_at) await db.from("messages").update({ clicked_at: ev.click?.timestamp }).eq("id", m.id);
      await log("click", { link: ev.click?.link });
      await emit(m.workspace_id, "email.clicked", { ...base, link: ev.click?.link });
      break;
    }
    case "Reject":
    case "Rendering Failure": {
      await db.from("messages").update({ status: "failed", last_error: ev.reject?.reason ?? ev.eventType }).eq("id", m.id);
      await log("reject", { reason: ev.reject?.reason });
      await emit(m.workspace_id, "email.failed", { ...base, error: ev.reject?.reason ?? ev.eventType });
      break;
    }
  }
}
