import "server-only";
import { admin } from "@/lib/supabase/admin";

export const RECIPIENT_FILTERS = {
  all: "Everyone",
  opened: "Opened",
  clicked: "Clicked",
  not_opened: "Didn't open",
  bounced: "Bounced",
  unsubscribed: "Unsubscribed",
  failed: "Not sent",
} as const;
export type RecipientFilter = keyof typeof RECIPIENT_FILTERS;

export const isFilter = (f: string | undefined): f is RecipientFilter => !!f && f in RECIPIENT_FILTERS;

const COLUMNS =
  "id, to_email, status, sent_at, delivered_at, opened_at, clicked_at, open_count, click_count, last_error, contact:contacts(id, first_name, last_name, status)";

export type RecipientRow = {
  id: string;
  to_email: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  open_count: number;
  click_count: number;
  last_error: string | null;
  contact: { id: string; first_name: string | null; last_name: string | null; status: string } | null;
};

/** Message ids in this campaign whose contact unsubscribed because of it. */
async function unsubscribedIds(campaignId: string) {
  const db = admin();
  const { data: msgs } = await db.from("messages").select("id").eq("campaign_id", campaignId).limit(100_000);
  const ids = (msgs ?? []).map((m) => m.id);
  if (!ids.length) return [];
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db.from("events").select("message_id").eq("type", "unsubscribe").in("message_id", ids.slice(i, i + 500));
    data?.forEach((e) => e.message_id && out.add(e.message_id));
  }
  return [...out];
}

/**
 * Build the filtered query for a campaign's recipients.
 * Returned wrapped in an object: query builders are thenables, so returning one
 * directly from an async function would execute it.
 */
async function query(campaignId: string, filter: RecipientFilter, q: string | undefined, head = false) {
  let qb = admin()
    .from("messages")
    .select(COLUMNS, head ? { count: "exact", head: true } : { count: "exact" })
    .eq("campaign_id", campaignId);
  switch (filter) {
    case "opened": qb = qb.or("opened_at.not.is.null,clicked_at.not.is.null"); break;
    case "clicked": qb = qb.not("clicked_at", "is", null); break;
    case "not_opened": qb = qb.in("status", ["sent", "delivered"]).is("opened_at", null).is("clicked_at", null); break;
    case "bounced": qb = qb.in("status", ["bounced", "complained"]); break;
    case "failed": qb = qb.in("status", ["failed", "suppressed", "queued", "sending"]); break;
    case "unsubscribed": {
      const ids = await unsubscribedIds(campaignId);
      qb = qb.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      break;
    }
  }
  if (q) qb = qb.ilike("to_email", `%${q.replace(/[%_,()]/g, "")}%`);
  return { qb };
}

export async function recipientsPage(campaignId: string, filter: RecipientFilter, q: string | undefined, page: number, size = 100) {
  const { qb } = await query(campaignId, filter, q);
  const { data, count } = await qb
    .order("clicked_at", { ascending: false, nullsFirst: false })
    .order("opened_at", { ascending: false, nullsFirst: false })
    .order("to_email")
    .range((page - 1) * size, page * size - 1);
  return { rows: (data ?? []) as unknown as RecipientRow[], total: count ?? 0 };
}

export async function filterCounts(campaignId: string) {
  const entries = await Promise.all(
    (Object.keys(RECIPIENT_FILTERS) as RecipientFilter[]).map(async (f) => {
      const { qb } = await query(campaignId, f, undefined, true);
      const { count } = await qb;
      return [f, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<RecipientFilter, number>;
}

/** All matching rows (for CSV export), paged through 1000 at a time. */
export async function allRecipients(campaignId: string, filter: RecipientFilter) {
  const rows: RecipientRow[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { qb } = await query(campaignId, filter, undefined);
    const { data } = await qb.order("to_email").range(from, from + 999);
    rows.push(...((data ?? []) as unknown as RecipientRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/** Human status for one recipient. */
export function recipientState(r: RecipientRow): { label: string; tone: string } {
  if (r.status === "bounced") return { label: "Bounced", tone: "bg-red-50 text-danger" };
  if (r.status === "complained") return { label: "Marked as spam", tone: "bg-red-50 text-danger" };
  if (r.status === "failed") return { label: "Failed", tone: "bg-red-50 text-danger" };
  if (r.status === "suppressed") return { label: "Skipped", tone: "bg-gray-100 text-muted" };
  if (r.status === "queued" || r.status === "sending") return { label: "Sending", tone: "bg-amber-50 text-warn" };
  if (r.clicked_at) return { label: "Clicked", tone: "bg-frog-700 text-white" };
  if (r.opened_at) return { label: "Opened", tone: "bg-frog-100 text-forest" };
  return { label: r.status === "delivered" ? "Delivered" : "Sent", tone: "bg-gray-100 text-ink" };
}
