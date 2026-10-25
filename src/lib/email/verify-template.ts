/**
 * Branded "confirm your sending address" email, used as an SES custom verification template.
 * SES only allows a small set of HTML tags (no <a>, no comments) and appends the
 * confirmation link plus a fixed disclaimer underneath this content.
 */
export function verifyTemplate() {
  const html = [
    `<html><head></head><body style="margin:0;padding:0;background:#f0fdf4;font-family:Helvetica,Arial,sans-serif;color:#0f172a">`,
    `<table width="100%" style="background:#f0fdf4;padding:32px 16px"><tr><td>`,
    `<table width="560" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #dcfce7">`,
    `<tr><td style="padding:24px 32px;border-bottom:1px solid #dcfce7">`,
    `<span style="font-size:20px;font-weight:bold;color:#15803d">&#128056; Desk Frog Mail</span>`,
    `</td></tr>`,
    `<tr><td style="padding:28px 32px">`,
    `<h1 style="margin:0 0 12px;font-size:22px;color:#0f172a">Confirm your sending address</h1>`,
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">Someone (hopefully you) added this email address as a sender in Desk Frog Mail, so campaigns can go out from it.</p>`,
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6"><b>Click the link below to confirm.</b> That&#39;s it &#8211; no DNS or technical setup needed.</p>`,
    `<p style="margin:0;font-size:13px;line-height:1.6;color:#64748b">The link passes through our secure email delivery partner, then brings you back to Desk Frog Mail.</p>`,
    `</td></tr></table>`,
    `</td></tr></table></body></html>`,
  ].join("");
  return { subject: "Confirm your sending address · Desk Frog Mail", html };
}
