import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "@/lib/api";
import { formSubmission, getFormByKey, originAllowed, rateLimited, submitForm } from "@/lib/forms";

export const runtime = "nodejs";

/**
 * Public signup form endpoint: POST /api/forms/frm_…
 * No API key: the form's public key only allows adding signups, limited to the
 * form's allowed websites, rate limited per IP, with a honeypot field.
 * Accepts JSON (fetch) or a plain HTML form post (redirects to the form's redirect URL).
 */
type P = { params: Promise<{ key: string }> };

function cors(origin: string | null, allowed: boolean) {
  const h: Record<string, string> = { Vary: "Origin" };
  if (origin && allowed) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

export async function OPTIONS(req: NextRequest, { params }: P) {
  const { key } = await params;
  const origin = req.headers.get("origin");
  const form = await getFormByKey(key);
  return new NextResponse(null, { status: 204, headers: cors(origin, !!form && form.enabled && originAllowed(form, origin)) });
}

export async function POST(req: NextRequest, { params }: P) {
  const { key } = await params;
  const origin = req.headers.get("origin");
  const type = req.headers.get("content-type") ?? "";
  const isJson = type.includes("application/json");
  const form = await getFormByKey(key);
  const allowed = !!form && originAllowed(form, origin);
  const headers = cors(origin, allowed);

  const reply = (status: number, payload: object, result?: string) => {
    // Plain HTML form post: send the browser somewhere sensible.
    if (!isJson && form?.redirect_url && status < 400) {
      const u = new URL(form.redirect_url);
      if (result) u.searchParams.set("signup", result);
      return NextResponse.redirect(u, 303);
    }
    return NextResponse.json(payload, { status, headers });
  };
  const error = (status: number, code: string, message: string) => reply(status, { error: { code, message } });

  if (!form || !form.enabled) return error(404, "form_not_found", "This signup form doesn't exist or is switched off.");
  if (!allowed) return error(403, "origin_not_allowed", "This form can't be used from this website.");

  let raw: Record<string, unknown>;
  try {
    if (isJson) raw = (await req.json()) as Record<string, unknown>;
    else {
      const fd = await req.formData();
      raw = {};
      const fields: Record<string, string> = {};
      for (const [k, v] of fd.entries()) {
        if (typeof v !== "string") continue;
        const m = /^fields\[(.+)\]$/.exec(k);
        if (m) fields[m[1]] = v;
        else raw[k] = v;
      }
      if (Object.keys(fields).length) raw.fields = fields;
    }
  } catch {
    return error(400, "invalid_body", "Couldn't read the form.");
  }

  // Honeypot: bots fill hidden fields. Pretend it worked.
  if (raw.website || raw._hp) return reply(200, { data: { status: form.double_opt_in ? "pending" : "subscribed" } }, "ok");

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  if (await rateLimited(form, ip)) return error(429, "rate_limited", "Too many signups from here. Please try again later.");

  try {
    const input = formSubmission.parse(raw);
    const result = await submitForm(form, input, origin);
    return reply(200, { data: result }, result.status);
  } catch (err) {
    if (err instanceof ZodError) return error(422, "invalid_email", "Please enter a valid email address.");
    if (err instanceof ApiError && err.code === "contact_limit") {
      console.warn(`signup form ${form.id}: workspace at contact limit`);
      return error(503, "unavailable", "Signups are paused right now. Please try again later.");
    }
    console.error(err);
    return error(500, "internal_error", "Something went wrong. Please try again.");
  }
}
