import { NextResponse, type NextRequest } from "next/server";
import { zipSync, strToU8 } from "fflate";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
};

/** Page through a table in 1,000-row chunks. */
async function all(table: string, select: string, ws: string, extra?: (q: any) => any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    let q = admin().from(table).select(select).eq("workspace_id", ws).range(from, from + 999);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < 1000) return out;
  }
}

export async function GET(req: NextRequest) {
  const { workspace } = await requireSession();
  const db = admin();
  const { data: w } = await db.from("workspaces").select("last_export_at").eq("id", workspace.id).single();
  if (w?.last_export_at && Date.now() - new Date(w.last_export_at).getTime() < 3_600_000) {
    return NextResponse.redirect(new URL("/app/settings/data", req.url));
  }
  await db.from("workspaces").update({ last_export_at: new Date().toISOString() }).eq("id", workspace.id);

  const include = new Set(req.nextUrl.searchParams.getAll("include"));
  const days = Number(req.nextUrl.searchParams.get("range") ?? 30);
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  const files: Record<string, Uint8Array> = {};
  const add = (name: string, rows: Record<string, unknown>[]) => (files[name] = strToU8(csv(rows)));

  if (include.has("contacts")) add("contacts.csv", await all("contacts", "email, first_name, last_name, status, tags, fields, external_id, consent_source, consented_at, unsubscribed_at, created_at", workspace.id));
  if (include.has("lists")) {
    add("lists.csv", await all("lists", "id, name, from_name, from_email, postal_address, permission_reminder, created_at", workspace.id));
    add("list_members.csv", await all("list_members", "list_id, status, added_at, contact:contacts(email)", workspace.id));
  }
  if (include.has("campaigns")) add("campaigns.csv", await all("campaigns", "id, name, subject, from_name, from_email, status, format, started_at, completed_at, created_at, html, text", workspace.id));
  if (include.has("reports"))
    add("emails_sent.csv", await all("messages", "to_email, kind, status, subject, sent_at, delivered_at, opened_at, clicked_at, open_count, click_count, campaign_id", workspace.id, (q) => (since ? q.gte("created_at", since) : q)));
  if (include.has("templates")) add("templates.csv", await all("templates", "id, name, subject, created_at, html", workspace.id));
  if (include.has("unsubscribes")) add("unsubscribes.csv", await all("contacts", "email, status, unsubscribed_at", workspace.id, (q) => q.neq("status", "subscribed")));
  if (include.has("media")) {
    const { data: objs } = await db.storage.from("email-assets").list(workspace.id, { limit: 1000 });
    add("media.csv", (objs ?? []).filter((o) => o.id).map((o) => ({ name: o.name, url: db.storage.from("email-assets").getPublicUrl(`${workspace.id}/${o.name}`).data.publicUrl, created_at: o.created_at })));
  }
  files["README.txt"] = strToU8(`Desk Frog Mail export for ${workspace.name}\nCreated ${new Date().toISOString()}\n`);

  const zip = zipSync(files, { level: 6 });
  const name = `deskfrog-${workspace.slug}-${new Date().toISOString().slice(0, 10)}.zip`;
  return new NextResponse(Buffer.from(zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
