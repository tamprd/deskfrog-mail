import { env } from "@/lib/env";

export type MergeContact = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  fields?: Record<string, unknown> | null;
  unsub_token?: string | null;
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Replace {{tag}} and {{tag|fallback}} with contact values. HTML-escaped unless `raw`. */
export function merge(input: string, c: MergeContact, raw = false): string {
  const values: Record<string, unknown> = {
    email: c.email,
    first_name: c.first_name ?? "",
    last_name: c.last_name ?? "",
    ...(c.fields ?? {}),
  };
  return input.replace(/\{\{\s*([\w.]+)\s*(?:\|\s*([^}]*))?\}\}/g, (_, key: string, fallback?: string) => {
    const v = values[key];
    const str = v === undefined || v === null || v === "" ? (fallback ?? "").trim() : String(v);
    return raw ? str : escapeHtml(str);
  });
}

export const unsubscribeUrl = (token: string) => `${env.appUrl}/u/${token}`;
export const oneClickUrl = (token: string) => `${env.appUrl}/api/unsubscribe/${token}`;

export const BADGE_HTML = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px">
  <tr><td align="center">
    <a href="https://mail.deskfrog.studio/?ref=badge" style="display:inline-block;padding:6px 12px;border-radius:999px;background:#ECFDF3;color:#0F5132;font:600 12px/1.4 Inter,Arial,sans-serif;text-decoration:none">
      🐸 Sent with Desk Frog Mail
    </a>
  </td></tr>
</table>`;

/**
 * Compliance footer: sender identification + working unsubscribe (Spam Act 2003),
 * plus the free-plan badge.
 */
export function footerHtml(opts: { senderName: string; senderAddress?: string | null; unsubToken: string; badge: boolean }) {
  const addr = opts.senderAddress ? `<br>${escapeHtml(opts.senderAddress)}` : "";
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;border-top:1px solid #E5E7EB">
  <tr><td align="center" style="padding:16px 12px;font:12px/1.6 Inter,Arial,sans-serif;color:#6B7280">
    You're receiving this from ${escapeHtml(opts.senderName)}.${addr}<br>
    <a href="${unsubscribeUrl(opts.unsubToken)}" style="color:#0F5132">Unsubscribe</a>
  </td></tr>
</table>${opts.badge ? BADGE_HTML : ""}`;
}

export function footerText(opts: { senderName: string; senderAddress?: string | null; unsubToken: string; badge: boolean }) {
  return [
    "",
    "--",
    `You're receiving this from ${opts.senderName}.`,
    opts.senderAddress ?? "",
    `Unsubscribe: ${unsubscribeUrl(opts.unsubToken)}`,
    opts.badge ? "Sent with Desk Frog Mail — https://mail.deskfrog.studio" : "",
  ]
    .filter((l, i) => l !== "" || i < 2)
    .join("\n");
}

/** Insert footer before </body> if present, else append. */
export function withFooter(html: string, footer: string) {
  const i = html.toLowerCase().lastIndexOf("</body>");
  return i === -1 ? html + footer : html.slice(0, i) + footer + html.slice(i);
}

export function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<(br|\/p|\/div|\/h\d|\/tr|\/li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
