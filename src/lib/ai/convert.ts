// Converts Claude's flat, schema-constrained output into a real editor Design, and back.
import { settingsFromBrand, uid, type Align, type Block, type Brand, type ChildBlock, type Design } from "@/lib/email/design";
import { primary, tint } from "@/lib/email/templates";
import { plain, sanitizeRichText } from "./sanitize";

const CHILD_TYPES = ["heading", "text", "image", "button", "divider", "spacer"] as const;
const BLOCK_TYPES = ["logo", "hero", ...CHILD_TYPES, "columns", "social"] as const;
const ALIGN = ["left", "center", "right"] as const;

// Every property is required (structured outputs allow few optional params); unused ones come back empty.
const childSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "text", "html", "level", "align"],
  properties: {
    type: { type: "string", enum: CHILD_TYPES },
    text: { type: "string", description: "heading text, button label, or image description (alt text)" },
    html: { type: "string", description: "text blocks only: simple HTML using <p>, <strong>, <em>, <a href>, <ul>/<ol>/<li>" },
    level: { type: "integer", description: "heading size 1 (large) to 3 (small); spacer height in px for spacers" },
    align: { type: "string", enum: ALIGN },
  },
} as const;

const blockSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "text", "html", "level", "align", "eyebrow", "body", "buttonLabel", "band", "dark", "columns"],
  properties: {
    ...childSchema.properties,
    type: { type: "string", enum: BLOCK_TYPES },
    eyebrow: { type: "string", description: "hero only: short uppercase label above the headline, or empty" },
    body: { type: "string", description: "hero only: one or two sentences under the headline" },
    buttonLabel: { type: "string", description: "hero only: button text, or empty for no button" },
    band: { type: "boolean", description: "true to put this block on a pale brand-coloured band (use sparingly, for key facts)" },
    dark: { type: "boolean", description: "hero only: dark banner instead of brand colour" },
    columns: { type: "array", items: { type: "array", items: { $ref: "#/$defs/child" } }, description: "columns only: 2 or 3 columns of child blocks" },
  },
} as const;

export const AI_DESIGN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "preheader", "blocks"],
  $defs: { child: childSchema },
  properties: {
    subject: { type: "string" },
    preheader: { type: "string" },
    blocks: { type: "array", items: blockSchema },
  },
} as const;

type AiChild = { type: string; text: string; html: string; level: number; align: string };
type AiBlock = AiChild & { eyebrow: string; body: string; buttonLabel: string; band: boolean; dark: boolean; columns: AiChild[][] };
export type AiDesign = { subject: string; preheader: string; blocks: AiBlock[] };

const align = (a: string): Align => ((ALIGN as readonly string[]).includes(a) ? (a as Align) : "left");
const clampLevel = (n: number): 1 | 2 | 3 => (n <= 1 ? 1 : n >= 3 ? 3 : 2);

function child(c: AiChild): ChildBlock | null {
  const id = uid();
  switch (c.type) {
    case "heading": return plain(c.text) ? { id, type: "heading", text: plain(c.text, 200), level: clampLevel(c.level), align: align(c.align) } : null;
    case "text": return c.html || c.text ? { id, type: "text", html: sanitizeRichText(c.html || c.text), align: align(c.align) } : null;
    case "image": return { id, type: "image", src: "", alt: plain(c.text, 200), width: 100, align: "center", rounded: true };
    case "button": return { id, type: "button", label: plain(c.text, 60) || "Find out more", href: "https://", align: align(c.align) };
    case "divider": return { id, type: "divider", thickness: 1 };
    case "spacer": return { id, type: "spacer", height: Math.max(8, Math.min(64, c.level || 16)) };
    default: return null;
  }
}

/** Build an editor Design from Claude's output, applying the workspace brand. */
export function aiToDesign(ai: AiDesign, brand: Partial<Brand>): Design {
  const blocks: Block[] = [];
  for (const b of ai.blocks.slice(0, 30)) {
    let out: Block | null = null;
    switch (b.type) {
      case "logo":
        out = brand.logoUrl ? { id: uid(), type: "logo", align: "center", width: 140 } : null;
        break;
      case "hero":
        out = {
          id: uid(), type: "hero",
          eyebrow: plain(b.eyebrow, 60), heading: plain(b.text, 120) || "Headline", text: plain(b.body, 400),
          buttonLabel: plain(b.buttonLabel, 40), buttonHref: "https://",
          bg: b.dark ? "#111827" : primary(brand), textColor: "#FFFFFF",
          buttonBg: b.dark ? primary(brand) : "#FFFFFF", buttonColor: b.dark ? "#FFFFFF" : primary(brand),
          align: align(b.align === "left" ? "left" : "center"),
        };
        break;
      case "columns": {
        const cols = (b.columns ?? []).slice(0, 3).map((col) => col.map(child).filter((x): x is ChildBlock => !!x)).filter((c) => c.length);
        out = cols.length >= 2 ? { id: uid(), type: "columns", columns: cols, stackOnMobile: true } : cols[0]?.[0] ?? null;
        break;
      }
      case "social":
        out = { id: uid(), type: "social", align: "center", links: [{ network: "facebook", url: "https://facebook.com/" }, { network: "instagram", url: "https://instagram.com/" }] };
        break;
      default:
        out = child(b);
    }
    if (out) blocks.push(b.band && out.type !== "hero" ? { ...out, sectionBg: tint(brand) } : out);
  }
  return {
    version: 1,
    settings: { ...settingsFromBrand(brand), preheader: plain(ai.preheader, 150) },
    blocks,
  };
}

// ── Editing existing designs: expose only text fields, apply patches back ──

export type TextField = { id: string; field: string; kind: "plain" | "html"; value: string };

/** Every editable piece of copy in a design, addressed by block id + field. */
export function textFields(d: Design): TextField[] {
  const out: TextField[] = [];
  const visit = (b: Block | ChildBlock) => {
    switch (b.type) {
      case "heading": out.push({ id: b.id, field: "text", kind: "plain", value: b.text }); break;
      case "text": out.push({ id: b.id, field: "html", kind: "html", value: b.html }); break;
      case "button": out.push({ id: b.id, field: "label", kind: "plain", value: b.label }); break;
      case "image": if (b.alt) out.push({ id: b.id, field: "alt", kind: "plain", value: b.alt }); break;
      case "hero":
        if (b.eyebrow) out.push({ id: b.id, field: "eyebrow", kind: "plain", value: b.eyebrow });
        out.push({ id: b.id, field: "heading", kind: "plain", value: b.heading });
        if (b.text) out.push({ id: b.id, field: "text", kind: "plain", value: b.text });
        if (b.buttonLabel) out.push({ id: b.id, field: "buttonLabel", kind: "plain", value: b.buttonLabel });
        break;
      case "columns": b.columns.flat().forEach(visit); break;
    }
  };
  d.blocks.forEach(visit);
  return out;
}

export const PATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["changes"],
  properties: {
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "field", "value"],
        properties: { id: { type: "string" }, field: { type: "string" }, value: { type: "string" } },
      },
    },
  },
} as const;

/** Apply text patches; ignores anything that doesn't match an existing editable field. */
export function applyPatches(d: Design, changes: { id: string; field: string; value: string }[]): { design: Design; applied: number } {
  const allowed = new Map(textFields(d).map((f) => [`${f.id}:${f.field}`, f]));
  const byId = new Map<string, Record<string, string>>();
  let applied = 0;
  for (const c of changes) {
    const f = allowed.get(`${c.id}:${c.field}`);
    if (!f) continue;
    const value = f.kind === "html" ? sanitizeRichText(c.value) : plain(c.value, 400);
    if (!value || value === f.value) continue;
    byId.set(c.id, { ...(byId.get(c.id) ?? {}), [c.field]: value });
    applied++;
  }
  const patch = <T extends Block | ChildBlock>(b: T): T => {
    const p = byId.get(b.id);
    const next = p ? ({ ...b, ...p } as T) : b;
    return next.type === "columns" ? ({ ...next, columns: next.columns.map((col) => col.map(patch)) } as T) : next;
  };
  return { design: { ...d, blocks: d.blocks.map(patch) }, applied };
}
