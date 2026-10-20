import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { admin } from "@/lib/supabase/admin";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function fail(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Request body failed validation", details: err.flatten() } },
      { status: 422 },
    );
  }
  console.error(err);
  return NextResponse.json({ error: { code: "internal_error", message: "Something went wrong" } }, { status: 500 });
}

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Body must be valid JSON");
  }
  return schema.parse(raw);
}

export function dbError(error: { message: string; code?: string } | null): never | void {
  if (!error) return;
  if (error.code === "23505") throw new ApiError(409, "conflict", error.message);
  if (error.code === "PGRST116") throw new ApiError(404, "not_found", "Not found");
  throw new Error(error.message);
}

// ── API keys ────────────────────────────────────────────────

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export function generateApiKey() {
  const key = `dfm_live_${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, 14), hash: hashKey(key) };
}

export type ApiContext = { workspaceId: string; keyId: string };

/** Resolve `Authorization: Bearer dfm_live_…` to a workspace. */
export async function authenticate(req: NextRequest): Promise<ApiContext> {
  const header = req.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!key.startsWith("dfm_")) throw new ApiError(401, "unauthorized", "Missing or invalid API key");

  const db = admin();
  const { data } = await db
    .from("api_keys")
    .select("id, workspace_id, revoked_at, last_used_at, expires_at")
    .eq("key_hash", hashKey(key))
    .maybeSingle();
  if (!data || data.revoked_at) throw new ApiError(401, "unauthorized", "Missing or invalid API key");
  if (data.expires_at && new Date(data.expires_at) < new Date()) throw new ApiError(401, "key_expired", "This API key has expired");

  // Cheap last-used tracking: at most once a minute.
  if (!data.last_used_at || Date.now() - new Date(data.last_used_at).getTime() > 60_000) {
    void db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  }
  return { workspaceId: data.workspace_id, keyId: data.id };
}

/** Wrap a route handler with auth + error handling. */
export function route<P = Record<string, string>>(
  handler: (req: NextRequest, ctx: ApiContext, params: P) => Promise<Response>,
) {
  return async (req: NextRequest, { params }: { params: Promise<P> }) => {
    try {
      const ctx = await authenticate(req);
      return await handler(req, ctx, await params);
    } catch (err) {
      return fail(err);
    }
  };
}

export function pagination(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 500);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
  return { limit, offset, url };
}
