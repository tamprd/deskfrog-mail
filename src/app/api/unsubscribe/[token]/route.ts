import { NextResponse, type NextRequest } from "next/server";
import { unsubscribeByToken } from "@/lib/suppress";

export const runtime = "nodejs";

/** RFC 8058 one-click unsubscribe target (mail clients POST here with no user interaction). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await unsubscribeByToken(token, "one_click");
  // Always 200 so the token's validity isn't leaked.
  return NextResponse.json({ ok: true });
}
