import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Brand, Design } from "@/lib/email/design";
import { AI_DESIGN_SCHEMA, PATCH_SCHEMA, aiToDesign, applyPatches, textFields, type AiDesign } from "./convert";

let client: Anthropic | null = null;
function claude() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("AI isn't set up yet (ANTHROPIC_API_KEY missing).");
  return (client ??= new Anthropic());
}

// Sonnet for whole emails (quality), Haiku for quick edits (speed + cost).
const WRITER = "claude-sonnet-5-5";
const EDITOR = "claude-haiku-5-5";

const HOUSE_STYLE = `You write marketing and community emails for small Australian businesses, clubs and motorsport events using Desk Frog Mail.
Rules:
- Australian English spelling (colour, organise, programme for events is fine). Warm, clear, direct. No hype, no ALL CAPS, at most one exclamation mark per email, emojis only where they help.
- Short paragraphs (1–3 sentences). Scannable. One clear call to action.
- Never invent facts. If the brief lacks a specific detail (price, date, address, phone), write a bracketed placeholder like [date] or [price] so the sender can fill it in.
- Personalise with merge tags where natural: {{first_name|there}} for first name with a fallback. Do not invent other merge tags unless the brief mentions them.
- Do NOT write an unsubscribe link, postal address, or legal footer — Desk Frog Mail adds those automatically.
- Avoid spam-trigger phrasing ("100% free", "act now!!!", "guaranteed").`;

function textOf(msg: Anthropic.Message) {
  const block = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block) throw new Error("The AI returned no content. Try again.");
  return block.text;
}

function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("The AI response was cut short. Try a shorter brief.");
  }
}

/** Write a complete email design from a brief. */
export async function generateDesign(opts: { brief: string; tone: string; senderName: string; brand: Partial<Brand> }) {
  const msg = await claude().messages.create({
    model: WRITER,
    max_tokens: 16000,
    system: `${HOUSE_STYLE}

You output an email as a list of layout blocks for a drag-and-drop editor:
- logo: the sender's logo (use as the first block).
- hero: a bold coloured banner — text = headline, body = 1–2 sentences, eyebrow = optional short label, buttonLabel = optional CTA. Use at most one, near the top.
- heading (text, level 1–3), text (html), button (text = label), image (text = what the photo should show — the sender uploads it later), divider, spacer (level = px).
- columns: 2–3 side-by-side columns of child blocks, good for key facts (date / venue / price) or two stories.
- social: social media icons, usually last.
Set band=true on at most two blocks to highlight key info. Keep emails focused: typically 5–12 blocks.
Unused fields must be empty strings, 0, false or [].`,
    messages: [
      {
        role: "user",
        content: `Sender: ${opts.senderName}\nTone: ${opts.tone}\n\nWhat the email is about:\n${opts.brief}`,
      },
    ],
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: AI_DESIGN_SCHEMA as unknown as Record<string, unknown> },
    },
  });
  if (msg.stop_reason === "refusal") throw new Error("The AI declined to write this email.");
  const ai = parseJson<AiDesign>(textOf(msg));
  const design = aiToDesign(ai, opts.brand);
  if (!design.blocks.length) throw new Error("The AI didn't produce any content. Try adding more detail.");
  return { subject: ai.subject.slice(0, 250), preheader: ai.preheader, design };
}

/** Rewrite copy in an existing design according to an instruction. Layout, images and colours are untouched. */
export async function rewriteDesign(design: Design, instruction: string, onlyBlockId?: string | null) {
  const fields = textFields(design).filter((f) => !onlyBlockId || f.id === onlyBlockId);
  if (!fields.length) throw new Error(onlyBlockId ? "That block has no text to rewrite." : "This email has no text yet.");
  const msg = await claude().messages.create({
    model: EDITOR,
    max_tokens: 8000,
    system: `${HOUSE_STYLE}

You edit the copy of an existing email. You receive its text fields as JSON (id, field, kind, value).
Return only the fields you changed. Keep each field's role: "plain" fields are plain text (no HTML); "html" fields use simple HTML (<p>, <strong>, <em>, <a href>, <ul>/<ol>/<li>).
Keep existing merge tags like {{first_name|there}}, links (href values) and bracketed placeholders unless the instruction says otherwise.`,
    messages: [
      { role: "user", content: `Instruction: ${instruction}\n\nFields:\n${JSON.stringify(fields)}` },
    ],
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: PATCH_SCHEMA as unknown as Record<string, unknown> },
    },
  });
  if (msg.stop_reason === "refusal") throw new Error("The AI declined this edit.");
  const { changes } = parseJson<{ changes: { id: string; field: string; value: string }[] }>(textOf(msg));
  return applyPatches(design, changes);
}

const SUBJECTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ideas"],
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["subject", "preheader"],
        properties: { subject: { type: "string" }, preheader: { type: "string" } },
      },
    },
  },
} as const;

/** Five subject line + preview text options for an email. */
export async function subjectIdeas(design: Design, current: string) {
  const copy = textFields(design).map((f) => f.value.replace(/<[^>]*>/g, " ")).join("\n").slice(0, 6000);
  const msg = await claude().messages.create({
    model: EDITOR,
    max_tokens: 2000,
    system: `${HOUSE_STYLE}

Suggest email subject lines. Each under 60 characters, specific to the content, varied in approach (direct, curiosity, benefit, urgency, personal with {{first_name|there}}). Preview text under 100 characters and must add information, not repeat the subject.`,
    messages: [{ role: "user", content: `Current subject: ${current || "(none)"}\n\nEmail copy:\n${copy}\n\nGive exactly 5 ideas.` }],
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: SUBJECTS_SCHEMA as unknown as Record<string, unknown> },
    },
  });
  const { ideas } = parseJson<{ ideas: { subject: string; preheader: string }[] }>(textOf(msg));
  return ideas.slice(0, 5).map((i) => ({ subject: i.subject.slice(0, 150), preheader: i.preheader.slice(0, 150) }));
}
