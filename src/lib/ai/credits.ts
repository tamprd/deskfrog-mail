import "server-only";
import { admin } from "@/lib/supabase/admin";

/** Monthly AI generations included per plan. */
export const AI_LIMITS: Record<string, number> = { free: 10, starter: 100, club: 200, growth: 300, pro: 1000 };
export const aiLimit = (planId: string) => AI_LIMITS[planId] ?? 10;

export class AiLimitError extends Error {}

/** Consume one credit, run `fn`, refund if it throws. */
export async function withCredit<T>(workspaceId: string, planId: string, fn: () => Promise<T>): Promise<T> {
  const db = admin();
  const { data: ok, error } = await db.rpc("use_ai_credit", { ws: workspaceId, lim: aiLimit(planId) });
  if (error) throw new Error(error.message);
  if (!ok) throw new AiLimitError(`You've used all ${aiLimit(planId)} AI credits for this month. Upgrade for more.`);
  try {
    return await fn();
  } catch (e) {
    await db.rpc("refund_ai_credit", { ws: workspaceId });
    throw e;
  }
}

export async function aiUsage(workspaceId: string, planId: string) {
  const period = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" }).slice(0, 8) + "01";
  const { data } = await admin().from("usage_monthly").select("ai_calls").eq("workspace_id", workspaceId).eq("period", period).maybeSingle();
  return { used: data?.ai_calls ?? 0, limit: aiLimit(planId) };
}
