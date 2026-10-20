import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { syncVerifyTemplate } from "@/lib/ses";

export const runtime = "nodejs";

/** Create/update the branded sender-verification email in SES. POST with Authorization: Bearer $CRON_SECRET. */
export async function POST(req: NextRequest) {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${env.cronSecret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, template: await syncVerifyTemplate() });
  } catch (e) {
    return NextResponse.json({ error: `${(e as Error).name}: ${(e as Error).message}` }, { status: 500 });
  }
}
