import { z } from "zod";

const tag = z.string().trim().min(1).max(64);
const fields = z.record(z.string().max(64), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]));

export const contactInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  first_name: z.string().max(100).nullish(),
  last_name: z.string().max(100).nullish(),
  external_id: z.string().max(200).nullish(),
  fields: fields.optional(),
  tags: z.array(tag).max(50).optional(),
  // Consent is required for marketing (Spam Act). Record where it came from.
  consent_source: z.string().max(200),
  consented_at: z.string().datetime().optional(),
  lists: z.array(z.string().uuid()).max(20).optional(),
});

export const contactsUpsert = z.union([
  contactInput,
  z.object({ contacts: z.array(contactInput).min(1).max(1000) }),
]);

export const contactPatch = contactInput
  .omit({ email: true, consent_source: true, lists: true })
  .partial()
  .extend({
    add_tags: z.array(tag).max(50).optional(),
    remove_tags: z.array(tag).max(50).optional(),
    status: z.enum(["subscribed", "unsubscribed"]).optional(),
  });

export const listInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).nullish(),
  double_opt_in: z.boolean().optional(),
});

export const listMembersInput = z.object({
  contact_ids: z.array(z.string().uuid()).max(5000).optional(),
  emails: z.array(z.string().trim().toLowerCase().email()).max(5000).optional(),
});

export const templateInput = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().max(250).default(""),
  html: z.string().max(500_000).default(""),
  text: z.string().max(200_000).nullish(),
});

export const campaignInput = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(250),
  from_name: z.string().trim().min(1).max(100),
  from_email: z.string().trim().toLowerCase().email(),
  reply_to: z.string().email().nullish(),
  html: z.string().max(500_000).optional(),
  text: z.string().max(200_000).nullish(),
  template_id: z.string().uuid().nullish(),
  list_id: z.string().uuid().nullish(),
  tag_filter: z.array(tag).max(20).optional(),
  // Block design (same JSON the editor produces). Rendered to HTML on save.
  design: z.object({ version: z.literal(1), settings: z.record(z.string(), z.unknown()), blocks: z.array(z.record(z.string(), z.unknown())) }).passthrough().optional(),
});

export const campaignSend = z.object({
  scheduled_at: z.string().datetime().optional(),
});

export const transactionalInput = z.object({
  to: z.string().trim().toLowerCase().email(),
  from_name: z.string().trim().min(1).max(100),
  from_email: z.string().trim().toLowerCase().email(),
  reply_to: z.string().email().nullish(),
  subject: z.string().trim().min(1).max(250),
  html: z.string().max(500_000).optional(),
  text: z.string().max(200_000).optional(),
  template_id: z.string().uuid().optional(),
  data: fields.optional(),
  idempotency_key: z.string().max(200).optional(),
}).refine((v) => v.html || v.text || v.template_id, { message: "Provide html, text or template_id" });

export const webhookInput = z.object({
  url: z.string().url().refine((u) => u.startsWith("https://"), "Webhook URL must be https"),
  events: z.array(z.string()).max(20).optional(),
});

export const domainInput = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/, "Invalid domain"),
});
