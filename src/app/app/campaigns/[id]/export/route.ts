import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { allRecipients, isFilter, recipientState } from "@/lib/recipients";

export const runtime = "nodejs";
export const maxDuration = 60;

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote, and neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace } = await requireSession();
  const { data: c } = await admin().from("campaigns").select("id, name").eq("id", id).eq("workspace_id", workspace.id).maybeSingle();
  if (!c) return new Response("Not found", { status: 404 });
  const f = new URL(req.url).searchParams.get("filter") ?? "all";
  const filter = isFilter(f) ? f : "all";

  const rows = await allRecipients(id, filter);
  const header = ["email", "first_name", "last_name", "status", "opened_at", "open_count", "clicked_at", "click_count", "delivered_at", "contact_status"];
  const lines = rows.map((r) =>
    [r.to_email, r.contact?.first_name, r.contact?.last_name, recipientState(r).label, r.opened_at, r.open_count, r.clicked_at, r.click_count, r.delivered_at ?? r.sent_at, r.contact?.status]
      .map(cell)
      .join(","),
  );
  const csv = "﻿" + [header.join(","), ...lines].join("\r\n");
  const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "campaign";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-${filter}.csv"`,
      "cache-control": "no-store",
    },
  });
}
