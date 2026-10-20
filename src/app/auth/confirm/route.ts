import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { userClient } from "@/lib/supabase/server";

/** Links in our sign-up / password-reset emails land here and sign the person straight in. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const nextParam = url.searchParams.get("next") ?? "/app";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/app";
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));
  if (!tokenHash || !type) return to("/login?error=That+link+is+incomplete.");
  const supabase = await userClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return to(`/login?error=${encodeURIComponent("That link has expired or was already used. " + (type === "recovery" ? "Ask for a new reset link below." : "Try signing in."))}${type === "recovery" ? "&mode=forgot" : ""}`);
  return to(next);
}
