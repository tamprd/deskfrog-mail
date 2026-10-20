/**
 * Parse a Mailchimp "Manage my data" export zip (runs in the browser).
 * Layout: <acct>/<export>/lists/{members,unsubscribed,cleaned}/<kind>_<listId>_<slug>.csv,
 *         files/<name>-<ext>, templates/<id>_<slug>.html
 */
import { unzipSync, strFromU8 } from "fflate";

export type McStatus = "subscribed" | "unsubscribed" | "cleaned";
export type McMember = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  fields: Record<string, string>;
  tags: string[];
  status: McStatus;
  optin_at: string | null;
  changed_at: string | null;
};
export type McList = { key: string; name: string; members: McMember[]; fieldNames: string[] };
export type McImage = { name: string; type: string; bytes: Uint8Array };
export type McTemplate = { name: string; html: string };
export type McExport = { lists: McList[]; images: McImage[]; templates: McTemplate[] };

/** RFC 4180 CSV (quotes, escaped quotes, newlines in fields). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { f += '"'; i++; } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); rows.push(row); row = []; f = "";
    } else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

// Mailchimp system columns we don't keep as custom fields.
const SYSTEM = new Set([
  "EMAIL ADDRESS", "FIRST NAME", "LAST NAME", "EMAIL_TYPE", "MEMBER_RATING", "OPTIN_TIME", "OPTIN_IP", "CONFIRM_TIME", "CONFIRM_IP",
  "GMTOFF", "DSTOFF", "TIMEZONE", "CC", "REGION", "LAST_CHANGED", "LEID", "EUID", "NOTES", "TAGS", "SOURCE",
]);
const fieldKey = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const isoOrNull = (s?: string) => {
  if (!s?.trim()) return null;
  const d = new Date(s.trim().replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? "" : "Z"));
  return isNaN(d.getTime()) ? null : d.toISOString();
};
/** TAGS look like: "Budget Enduro","2026 season" */
const parseTags = (s?: string) => (s ? Array.from(s.matchAll(/"([^"]+)"/g), (m) => m[1].trim()).filter(Boolean) : []);
const titleFromSlug = (slug: string) => slug.replace(/-+$/, "").split("-").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export function parseMailchimpZip(zip: Uint8Array, listNames: Record<string, string> = {}): McExport {
  const files = unzipSync(zip);
  const lists = new Map<string, McList>();
  const images: McImage[] = [];
  const templates: McTemplate[] = [];

  for (const [path, bytes] of Object.entries(files)) {
    if (!bytes.length) continue;
    const m = /lists\/(members|unsubscribed|cleaned)\/\w+?_(\d+)_([^/]*)\.csv$/.exec(path);
    if (m) {
      const [, kind, id, slug] = m;
      const status: McStatus = kind === "members" ? "subscribed" : kind === "unsubscribed" ? "unsubscribed" : "cleaned";
      const list = lists.get(id) ?? { key: id, name: listNames[id] ?? titleFromSlug(slug), members: [], fieldNames: [] };
      lists.set(id, list);
      const rows = parseCsv(strFromU8(bytes).replace(/^﻿/, ""));
      if (rows.length < 2) continue;
      const header = rows[0];
      const firstIdx = (name: string) => header.findIndex((h) => h.trim().toUpperCase() === name);
      const lastIdx = (name: string) => header.map((h) => h.trim().toUpperCase()).lastIndexOf(name);
      const iEmail = firstIdx("EMAIL ADDRESS");
      const iFirst = firstIdx("FIRST NAME");
      const iLast = firstIdx("LAST NAME");
      const iTags = lastIdx("TAGS");
      const iOptin = lastIdx("CONFIRM_TIME") >= 0 ? lastIdx("CONFIRM_TIME") : lastIdx("OPTIN_TIME");
      const iOptin2 = lastIdx("OPTIN_TIME");
      const iChanged = lastIdx("LAST_CHANGED");
      // Custom fields: any non-system column, plus the *first* of a duplicated system name (a merge field named e.g. SOURCE).
      const custom: [number, string][] = [];
      header.forEach((h, i) => {
        const u = h.trim().toUpperCase();
        if (!u) return;
        const dup = header.filter((x) => x.trim().toUpperCase() === u).length > 1;
        if (!SYSTEM.has(u) || (dup && firstIdx(u) === i)) custom.push([i, fieldKey(h)]);
      });
      for (const [, k] of custom) if (!list.fieldNames.includes(k)) list.fieldNames.push(k);
      for (const r of rows.slice(1)) {
        const email = (r[iEmail] ?? "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
        const fields: Record<string, string> = {};
        for (const [i, k] of custom) if (r[i]?.trim()) fields[k] = r[i].trim();
        list.members.push({
          email,
          first_name: r[iFirst]?.trim() || null,
          last_name: r[iLast]?.trim() || null,
          fields,
          tags: parseTags(r[iTags]),
          status,
          optin_at: isoOrNull(r[iOptin]) ?? isoOrNull(r[iOptin2]),
          changed_at: isoOrNull(r[iChanged]),
        });
      }
      continue;
    }
    const img = /\/files\/([^/]*)-(jpg|jpeg|png|gif|webp)$/i.exec(path);
    if (img) {
      const ext = img[2].toLowerCase();
      images.push({ name: `${img[1].replace(/-01$/, "") || "image"}.${ext}`, type: ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`, bytes });
      continue;
    }
    const tpl = /\/templates\/\d+_([^/]+)\.html?$/i.exec(path);
    if (tpl) templates.push({ name: titleFromSlug(tpl[1]), html: strFromU8(bytes) });
  }
  return { lists: [...lists.values()].sort((a, b) => b.members.length - a.members.length), images, templates };
}

/** Status across lists for one person: bounced beats subscribed beats unsubscribed. */
export function overallStatus(statuses: McStatus[]) {
  if (statuses.includes("cleaned")) return "bounced" as const;
  if (statuses.includes("subscribed")) return "subscribed" as const;
  return "unsubscribed" as const;
}
