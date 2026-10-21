import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { admin } from "@/lib/supabase/admin";
import { stopFeedbackForwarding, syncVerifyTemplate } from "@/lib/ses";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One-off SES housekeeping. POST with Authorization: Bearer $CRON_SECRET.
 * - loads the branded sender-verification email
 * - turns off Amazon's bounce emails to senders' inboxes on every identity we use
 */
export async function POST(req: NextRequest) {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${env.cronSecret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const out: Record<string, unknown> = {};
  try {
    out.template = await syncVerifyTemplate();
  } catch (e) {
    out.template = `${(e as Error).name}: ${(e as Error).message}`;
  }
  const db = admin();
  const [{ data: senders }, { data: domains }] = await Promise.all([
    db.from("sender_addresses").select("email").not("ses_verified_at", "is", null),
    db.from("sending_domains").select("domain"),
  ]);
  const ids = [...new Set([env.sharedSendingDomain, ...(domains ?? []).map((d) => d.domain), ...(senders ?? []).map((s) => s.email)])];
  const forwarding: Record<string, boolean> = {};
  for (const id of ids) forwarding[id] = await stopFeedbackForwarding(id);
  out.forwardingOff = forwarding;
  return NextResponse.json(out);
}
