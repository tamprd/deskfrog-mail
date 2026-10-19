# Desk Frog Mail 🐸

Email marketing made simple. Free with the Desk Frog badge, paid plans remove it.
Next.js 15 · Supabase (Postgres + Auth) · Amazon SES.

Dashboard: `mail.deskfrog.studio` · API: `mail.deskfrog.studio/api/v1`

## How it works

```
App (ArgusIQ, Midas, …) ──API key──▶ /api/v1/*  ──▶ messages table (the queue)
Dashboard user ──────────────────────▶ server actions ─┘          │
                                                               worker (every minute)
                                                                   │  claim_messages() — SKIP LOCKED
                                                                   ▼
                                                           Amazon SES ──events──▶ SNS ──▶ /api/ses/events
                                                                                         (bounce/complaint → suppress,
                                                                                          open/click → stats, webhooks out)
```

- **Multi-tenant**: everything is scoped by `workspace_id`. Dashboard users go through RLS; the API and worker use the service role.
- **Plans** live in the `plans` table (free / starter / growth / pro). Limits are enforced when queuing: contacts, monthly sends, daily sends. New workspaces are capped at 100/day for their first 7 days.
- **Free plan** sends from `<workspace-slug>@SHARED_SENDING_DOMAIN` with the customer's address as Reply-To, and every email carries the badge. Paid plans send from their own verified domain.
- **Compliance (Spam Act / Gmail+Yahoo bulk rules)**: consent source recorded per contact, footer with sender identification and an unsubscribe link, RFC 8058 one-click `List-Unsubscribe` headers, unsubscribes honoured instantly.
- **Abuse guardrails**: hard bounces and complaints go on a *global* suppression list. Workspaces auto-pause at a 4% bounce or 0.08% complaint rate (30 days, after 100 sends).

## Setup

### 1. Supabase
Migrations are in `supabase/migrations` (already applied to project `tbvcxjztgvcwifygdcjf`).
Auth → enable email/password. Set the Site URL to `https://mail.deskfrog.studio`.

### 2. Amazon SES (region `ap-southeast-2`)
1. Verify the shared sending domain (e.g. `send.deskfrogmail.com`). **Not** `deskfrog.studio`, which keeps the studio's mail reputation clean. Add the DKIM CNAMEs, plus SPF/DMARC.
2. Create a configuration set `deskfrog-mail`:
   - turn on open and click tracking
   - add an event destination → SNS topic, with events Send, Delivery, Bounce, Complaint, Reject, Open, Click, Rendering failure
3. Subscribe the SNS topic over HTTPS to `https://mail.deskfrog.studio/api/ses/events`. The subscription is confirmed automatically, and signatures are verified.
4. Create an IAM user with `ses:SendEmail`, `ses:CreateEmailIdentity` and `ses:GetEmailIdentity`.
5. **Request production access** (out of the sandbox). Describe the double opt-in, the consent checkbox, the automatic bounce/complaint suppression and auto-pause.

### 3. Environment
Copy `.env.example` to `.env.local` and fill it in.

### 4. Worker
Call `POST /api/cron/worker` with `Authorization: Bearer $CRON_SECRET` every minute. It releases scheduled campaigns, drains the queue at `SES_MAX_PER_SECOND`, and delivers webhooks. Options:
- Vercel Cron (minute schedules need the Pro plan)
- Supabase `pg_cron` + `pg_net`:
  ```sql
  select cron.schedule('deskfrog-worker', '* * * * *', $$
    select net.http_post('https://mail.deskfrog.studio/api/cron/worker',
      headers => jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'));
  $$);
  ```

## API

All requests: `Authorization: Bearer dfm_live_…` (create keys in Settings). JSON in, `{ data }` or `{ error: { code, message } }` out.

| Method | Path | |
|---|---|---|
| GET / POST | `/contacts` | List (filters: `status`, `tag`, `email`, `external_id`) / upsert one or `{ contacts: [...] }` up to 1000. `consent_source` is required |
| GET / PATCH / DELETE | `/contacts/:id` | `add_tags`, `remove_tags`, `fields`, `status: "unsubscribed"` |
| GET / POST | `/lists` | |
| POST / DELETE | `/lists/:id/members` | `{ contact_ids }` or `{ emails }` |
| GET / POST, GET / PATCH / DELETE | `/templates`, `/templates/:id` | |
| GET / POST | `/campaigns` | Draft from `html` or `template_id`; target `list_id` and/or `tag_filter` |
| GET / PATCH / DELETE | `/campaigns/:id` | DELETE cancels a scheduled or sending campaign |
| POST | `/campaigns/:id/send` | Send now, or `{ scheduled_at }` |
| GET | `/campaigns/:id/stats` | |
| POST | `/send` | Transactional email to one recipient. `data` for `{{merge}}` and `idempotency_key` supported |
| GET / POST, DELETE | `/webhooks`, `/webhooks/:id` | The secret is returned once |
| GET / POST, GET / DELETE | `/domains`, `/domains/:id` | Paid plans. GET re-checks verification |
| GET | `/usage` | Plan, limits and usage |

Merge tags: `{{first_name}}`, `{{last_name}}`, `{{email}}`, any key in `fields`, with fallbacks: `{{first_name|racer}}`.

### Example: ArgusIQ syncing an entrant
```bash
curl -X POST https://mail.deskfrog.studio/api/v1/contacts \
  -H "Authorization: Bearer $DFM_KEY" -H "Content-Type: application/json" \
  -d '{"email":"jess@example.com","first_name":"Jess","external_id":"argus-member-123",
       "tags":["budget-enduro","2026-season"],"fields":{"class":"Outright","car_number":"42"},
       "consent_source":"argusiq_entry_form"}'
```

### Webhooks
Events: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`, `email.failed`, `contact.unsubscribed`, `workspace.paused`.

Verify `DeskFrog-Signature: t=<unix>,v1=<hex>`, where `v1 = HMAC_SHA256(secret, "<t>.<raw body>")`. Reject anything where `t` is older than 5 minutes. Failed deliveries retry with backoff (1m → 24h).

## Email editor

`/editor/:campaignId` is a drag-and-drop block builder. A design is JSON (`src/lib/email/design.ts`) and is rendered to email-safe HTML with MJML (`src/lib/email/render.ts`) on every save.
- Blocks: logo, hero banner (colour or photo background), heading, text (rich text via TipTap, with merge tags), image (uploads to the `email-assets` Storage bucket), button, 2 or 3 columns, divider, spacer, social, raw HTML
- Brand kit per workspace (Settings → Brand): logo, colours and font apply to new emails
- 14 starter templates (`src/lib/email/templates.ts`):
  - General: Blank, Newsletter, Announcement, Welcome, Sale/promo, Event invite, Feedback request, Plain letter
  - Motorsport: Entries open, Results are up, Final instructions, Season calendar
  - Business: Service reminder, Monthly specials
- Templates page with live, brand-coloured previews. "Save as template" in the editor adds a design to the workspace's own templates.
- Any top-level block can have a section background colour (for coloured bands)
- Autosave, undo/redo, preview on desktop and mobile, and send test
- The API accepts the same `design` JSON on `POST /campaigns` and `PATCH /campaigns/:id`

## AI (Claude)

Set `ANTHROPIC_API_KEY` in Vercel. Code is in `src/lib/ai/`.
- **Write with AI** (New campaign): describe the email → Claude Sonnet 5.5 returns a schema-constrained block layout → converted to an on-brand editor design.
- **AI panel in the editor** (✨ AI): rewrite the whole email or the selected block (shorter, friendlier, urgent, fix grammar, or a custom instruction), and suggest 5 subject lines with preview text. Uses Claude Haiku 5.5. Edits only touch copy, never layout, images or links, and can be undone.
- AI output is sanitised (allow-listed tags, safe links only) before it reaches a design.
- **Credits**: each request uses one. Monthly limits per plan are in `src/lib/ai/credits.ts` (Free 10 / Starter 100 / Growth 300 / Pro 1000). Credits are refunded if a call fails.

## Not built yet
- Stripe billing / plan upgrades (the plan is changed in the DB for now)
- Double opt-in signup forms and automations
- Team invites (single owner per workspace)
