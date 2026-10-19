import "server-only";
import mjml2html from "mjml";
import { FONTS, type Block, type Brand, type ChildBlock, type Design } from "./design";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const color = (c: string | undefined, fallback: string) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : fallback);
const url = (u: string | undefined) => {
  const v = (u ?? "").trim();
  // Allow merge tags and normal links; drop javascript: etc.
  return /^(https?:|mailto:|tel:|\{\{)/i.test(v) ? v : "";
};
/** Keep raw HTML from closing the surrounding MJML tag. */
const rawSafe = (html: string) => html.replace(/<\/?mj-[^>]*>/gi, "").replace(/<\/?mjml[^>]*>/gi, "");

const HEADING_SIZE = { 1: 32, 2: 24, 3: 20 } as const;

function child(b: ChildBlock, d: Design): string {
  const s = d.settings;
  switch (b.type) {
    case "heading":
      return `<mj-text align="${b.align}" font-size="${HEADING_SIZE[b.level]}px" line-height="1.2" font-weight="800" color="${color(b.color, s.textColor)}" padding="8px 24px"><h${b.level} style="margin:0;font-size:inherit;font-weight:inherit;letter-spacing:-0.01em">${esc(b.text)}</h${b.level}></mj-text>`;
    case "text":
      return `<mj-text align="${b.align}" css-class="df-text" padding="8px 24px">${rawSafe(b.html)}</mj-text>`;
    case "image": {
      if (!b.src) return "";
      const href = url(b.href);
      return `<mj-image src="${esc(b.src)}" alt="${esc(b.alt)}" align="${b.align}" width="${Math.round((600 - 48) * Math.min(100, Math.max(10, b.width)) / 100)}px"${href ? ` href="${esc(href)}"` : ""}${b.rounded ? ` border-radius="12px"` : ""} padding="8px 24px" />`;
    }
    case "button":
      return `<mj-button href="${esc(url(b.href) || "#")}" align="${b.align}" background-color="${color(b.bg, s.buttonColor)}" color="${color(b.color, "#FFFFFF")}" font-weight="700" border-radius="8px" inner-padding="12px 24px" padding="12px 24px"${b.fullWidth ? ` width="100%"` : ""}>${esc(b.label)}</mj-button>`;
    case "divider":
      return `<mj-divider border-color="${color(b.color, "#E5E7EB")}" border-width="${Math.max(1, Math.min(8, b.thickness))}px" padding="12px 24px" />`;
    case "spacer":
      return `<mj-spacer height="${Math.max(4, Math.min(200, b.height))}px" />`;
  }
}

const SOCIAL_NAME: Record<string, string> = { facebook: "facebook", instagram: "instagram", x: "x", youtube: "youtube", linkedin: "linkedin", web: "web" };

function block(b: Block, d: Design, brand: Partial<Brand>): string {
  const bg = d.settings.contentBackground;
  const section = (inner: string, padding = "0px") =>
    `<mj-section background-color="${bg}" padding="${padding}"><mj-column>${inner}</mj-column></mj-section>`;

  switch (b.type) {
    case "logo":
      return brand.logoUrl
        ? section(`<mj-image src="${esc(brand.logoUrl)}" alt="Logo" align="${b.align}" width="${Math.max(40, Math.min(400, b.width))}px" padding="24px 24px 8px" />`)
        : "";
    case "social": {
      const links = b.links.filter((l) => url(l.url));
      if (!links.length) return "";
      const els = links
        .map((l) => `<mj-social-element name="${SOCIAL_NAME[l.network] ?? "web"}" href="${esc(url(l.url))}" background-color="${d.settings.buttonColor}"></mj-social-element>`)
        .join("");
      return section(`<mj-social align="${b.align}" icon-size="28px" mode="horizontal" padding="12px 24px">${els}</mj-social>`);
    }
    case "html":
      return section(`<mj-raw>${rawSafe(b.html)}</mj-raw>`, "8px 24px");
    case "columns": {
      const cols = b.columns
        .map((c) => `<mj-column vertical-align="top">${c.map((x) => child(x, d)).join("")}</mj-column>`)
        .join("");
      const inner = b.stackOnMobile ? cols : `<mj-group>${cols}</mj-group>`;
      return `<mj-section background-color="${bg}" padding="0px 12px">${inner}</mj-section>`;
    }
    default:
      return section(child(b, d));
  }
}

export function designToMjml(d: Design, brand: Partial<Brand> = {}) {
  const s = d.settings;
  const font = FONTS[s.font] ?? FONTS.inter;
  return `<mjml>
  <mj-head>
    ${font.href ? `<mj-font name="${font.label}" href="${font.href}" />` : ""}
    ${s.preheader ? `<mj-preview>${esc(s.preheader)}</mj-preview>` : ""}
    <mj-attributes>
      <mj-all font-family="${font.stack}" />
      <mj-text font-size="16px" line-height="1.6" color="${s.textColor}" />
    </mj-attributes>
    <mj-style inline="inline">
      .df-text p { margin: 0 0 12px; }
      .df-text a { color: ${s.linkColor}; text-decoration: underline; }
      .df-text ul, .df-text ol { margin: 0 0 12px; padding-left: 24px; }
      .df-text h2 { font-size: 22px; margin: 0 0 8px; }
      .df-text blockquote { margin: 0 0 12px; padding-left: 12px; border-left: 3px solid ${s.linkColor}; }
    </mj-style>
    <mj-style>
      .df-text p:last-child { margin-bottom: 0; }
    </mj-style>
  </mj-head>
  <mj-body background-color="${s.background}" width="600px">
    <mj-wrapper padding="24px 0">
      ${d.blocks.map((b) => block(b, d, brand)).join("\n      ")}
    </mj-wrapper>
  </mj-body>
</mjml>`;
}

type MjmlResult = { html: string; errors: { formattedMessage: string }[] };

/** Render a design to email-safe HTML. */
export async function renderDesign(d: Design, brand: Partial<Brand> = {}): Promise<string> {
  const run = mjml2html as unknown as (mjml: string, opts: object) => Promise<MjmlResult> | MjmlResult;
  const out = await run(designToMjml(d, brand), { validationLevel: "soft", keepComments: false });
  return out.html;
}
