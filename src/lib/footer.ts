import "server-only";
import { admin } from "@/lib/supabase/admin";
import type { FooterOpts } from "@/lib/render";
import type { Workspace } from "@/lib/workspace";

/** Footer settings for a campaign: the list's own address and permission reminder win over the workspace defaults. */
export async function footerFor(ws: Workspace, c: { from_name?: string | null; list_id?: string | null }, unsubToken: string): Promise<FooterOpts> {
  let list: { postal_address: string | null; permission_reminder: string | null; from_name: string | null } | null = null;
  if (c.list_id) {
    const { data } = await admin().from("lists").select("postal_address, permission_reminder, from_name").eq("id", c.list_id).maybeSingle();
    list = data;
  }
  return {
    senderName: c.from_name || list?.from_name || ws.name,
    senderAddress: list?.postal_address || ws.sender_address,
    reminder: list?.permission_reminder || null,
    unsubToken,
    badge: ws.plan.badge_required,
    referralCode: ws.referral_code,
  };
}
