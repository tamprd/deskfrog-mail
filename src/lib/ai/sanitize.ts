/** Keep only the formatting our text blocks support. Used on AI output before it touches a design. */
const ALLOWED = new Set(["p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "h2", "blockquote"]);

export function sanitizeRichText(html: string): string {
  const out = html
    .replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (tag, name: string, attrs: string) => {
      const n = name.toLowerCase();
      if (!ALLOWED.has(n)) return "";
      if (tag.startsWith("</")) return `</${n}>`;
      if (n === "a") {
        const href = /href\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? /href\s*=\s*'([^']*)'/i.exec(attrs)?.[1] ?? "";
        const safe = /^(https?:|mailto:|tel:|\{\{)/i.test(href.trim()) ? href.trim().replace(/"/g, "&quot;") : "https://";
        return `<a href="${safe}">`;
      }
      return n === "br" ? "<br>" : `<${n}>`;
    });
  // Bare text with no block wrapper → paragraph.
  return /^\s*<(p|ul|ol|h2|blockquote)/i.test(out) ? out.trim() : `<p>${out.trim()}</p>`;
}

/** Plain text for headings, labels, alt text: strip tags, collapse whitespace. */
export const plain = (s: string, max = 300) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, max);
