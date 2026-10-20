import "server-only";
import { admin } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";

export type Plan = {
  id: string;
  name: string;
  contact_limit: number;
  monthly_send_limit: number;
  daily_send_limit: number;
  badge_required: boolean;
  custom_domain: boolean;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "paused" | "suspended";
  status_reason: string | null;
  sender_address: string | null;
  referral_code: string | null;
  paused_at: string | null;
  created_at: string;
  plan: Plan;
};

/** New accounts are throttled for their first week regardless of plan. */
const NEW_ACCOUNT_DAYS = 7;
const NEW_ACCOUNT_DAILY_CAP = 100;

export async function getWorkspace(id: string): Promise<Workspace> {
  const { data, error } = await admin()
    .from("workspaces")
    .select("id, name, slug, status, status_reason, sender_address, referral_code, paused_at, created_at, plan:plans(*)")
    .eq("id", id)
    .single();
  if (error || !data) throw new ApiError(404, "not_found", "Workspace not found");
  return data as unknown as Workspace;
}

export function assertActive(ws: Workspace) {
  if (ws.status !== "active") {
    throw new ApiError(403, "workspace_paused", `Sending is ${ws.status}: ${ws.status_reason ?? "contact support"}`);
  }
}

const brisbaneDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
const brisbaneMonth = () => brisbaneDay().slice(0, 8) + "01";

export async function usage(workspaceId: string) {
  const db = admin();
  const [day, month, contacts] = await Promise.all([
    db.from("usage_daily").select("sends").eq("workspace_id", workspaceId).eq("day", brisbaneDay()).maybeSingle(),
    db.from("usage_monthly").select("sends").eq("workspace_id", workspaceId).eq("period", brisbaneMonth()).maybeSingle(),
    // Like other providers, only subscribed contacts count towards the plan limit.
    db.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "subscribed"),
  ]);
  // Queued-but-unsent messages count against the allowance too.
  const { count: queued } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .in("status", ["queued", "sending"]);
  return {
    sentToday: day.data?.sends ?? 0,
    sentThisMonth: month.data?.sends ?? 0,
    queued: queued ?? 0,
    contacts: contacts.count ?? 0,
  };
}

export function dailyCap(ws: Workspace) {
  const ageDays = (Date.now() - new Date(ws.created_at).getTime()) / 86_400_000;
  return ageDays < NEW_ACCOUNT_DAYS ? Math.min(ws.plan.daily_send_limit, NEW_ACCOUNT_DAILY_CAP) : ws.plan.daily_send_limit;
}

/** How many more emails this workspace may queue right now. */
export async function remainingSends(ws: Workspace) {
  const u = await usage(ws.id);
  const daily = dailyCap(ws) - u.sentToday - u.queued;
  const monthly = ws.plan.monthly_send_limit - u.sentThisMonth - u.queued;
  return Math.max(0, Math.min(daily, monthly));
}

export async function assertContactCapacity(ws: Workspace, adding: number) {
  const u = await usage(ws.id);
  if (u.contacts + adding > ws.plan.contact_limit) {
    throw new ApiError(
      402,
      "contact_limit",
      `The ${ws.plan.name} plan allows ${ws.plan.contact_limit.toLocaleString("en-AU")} subscribed contacts (you have ${u.contacts.toLocaleString("en-AU")}). Upgrade to add more.`,
    );
  }
}

/**
 * Work out the From header. Free plans send from the shared domain with the
 * customer's address as Reply-To; paid plans must use a verified domain.
 */
export async function resolveFrom(ws: Workspace, fromName: string, fromEmail: string) {
  const domain = fromEmail.split("@")[1]?.toLowerCase();
  if (ws.plan.custom_domain && domain) {
    const { data } = await admin()
      .from("sending_domains")
      .select("status")
      .eq("workspace_id", ws.id)
      .eq("domain", domain)
      .maybeSingle();
    if (data?.status === "verified") {
      return { from: formatAddress(fromName, fromEmail), replyTo: undefined as string | undefined };
    }
    // Not verified (or not added): fall back below.
  }
  // Address verified with Amazon, and its domain doesn't forbid others sending as it → send as them (like other providers).
  const { data: sender } = await admin()
    .from("sender_addresses")
    .select("ses_verified_at")
    .eq("workspace_id", ws.id)
    .eq("email", fromEmail.toLowerCase())
    .not("ses_verified_at", "is", null)
    .maybeSingle();
  if (sender) {
    const { canSendAs } = await import("@/lib/dmarc");
    if (await canSendAs(fromEmail)) return { from: formatAddress(fromName, fromEmail), replyTo: undefined as string | undefined };
  }
  const shared = `${ws.slug}@${env.sharedSendingDomain}`;
  return { from: formatAddress(fromName, shared), replyTo: fromEmail };
}

export function formatAddress(name: string, email: string) {
  const safe = name.replace(/["\r\n<>]/g, "").trim();
  return safe ? `"${safe}" <${email}>` : email;
}
