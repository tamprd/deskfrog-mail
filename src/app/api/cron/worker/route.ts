import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { processQueue } from "@/lib/queue";
import { deliverWebhooks } from "@/lib/webhooks";
import { releaseScheduled } from "@/lib/campaigns";
import { runNotifications } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorised(req: NextRequest) {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${env.cronSecret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Run every minute (Vercel Cron, Supabase pg_cron + pg_net, or any scheduler). */
async function run(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await releaseScheduled();
  const queue = await processQueue(45_000);
  const webhooks = await deliverWebhooks();
  const notifications = await runNotifications().catch((e) => ({ error: String(e) }));
  return NextResponse.json({ ok: true, queue, webhooks, notifications });
}

export const GET = run;
export const POST = run;
