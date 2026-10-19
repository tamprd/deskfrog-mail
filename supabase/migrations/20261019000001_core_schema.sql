-- Desk Frog Mail — core schema
-- Multi-tenant email platform: workspaces, contacts, lists, templates, campaigns,
-- per-recipient message queue, events, suppressions, usage metering, webhooks.

create extension if not exists citext with schema extensions;

-- ─────────────────────────────────────────────────────────────
-- Plans
-- ─────────────────────────────────────────────────────────────
create table public.plans (
  id                  text primary key,
  name                text not null,
  price_cents         integer not null default 0,        -- AUD / month
  contact_limit       integer not null,
  monthly_send_limit  integer not null,
  daily_send_limit    integer not null,
  badge_required      boolean not null default true,
  custom_domain       boolean not null default false,
  automations         boolean not null default false,
  sort                integer not null default 0
);

insert into public.plans (id, name, price_cents, contact_limit, monthly_send_limit, daily_send_limit, badge_required, custom_domain, automations, sort) values
  ('free',    'Free',    0,     500,    1000,    300,    true,  false, false, 0),
  ('starter', 'Starter', 1500,  2500,   15000,   5000,   false, true,  false, 1),
  ('growth',  'Growth',  3900,  10000,  60000,   20000,  false, true,  true,  2),
  ('pro',     'Pro',     7900,  50000,  300000,  100000, false, true,  true,  3);

-- ─────────────────────────────────────────────────────────────
-- Workspaces & membership
-- ─────────────────────────────────────────────────────────────
create table public.workspaces (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null unique,
  plan_id             text not null default 'free' references public.plans(id),
  status              text not null default 'active' check (status in ('active','paused','suspended')),
  status_reason       text,
  -- Physical mailing address is required in commercial emails under the Spam Act (sender identification).
  sender_address      text,
  stripe_customer_id  text,
  created_at          timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'member' check (role in ('owner','admin','member')),
  created_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on public.workspace_members (user_id);

-- RLS helper: is the current user a member of the workspace?
create or replace function public.is_member(ws uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_admin(ws uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.role in ('owner','admin')
  );
$$;

-- Create a workspace and make the caller its owner.
create or replace function public.create_workspace(ws_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
  base_slug text;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  base_slug := trim(both '-' from regexp_replace(lower(ws_name), '[^a-z0-9]+', '-', 'g'));
  if base_slug = '' then base_slug := 'workspace'; end if;
  insert into public.workspaces (name, slug)
  values (ws_name, base_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  returning id into new_id;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_id, (select auth.uid()), 'owner');
  return new_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- API keys (stored hashed; the plaintext is shown once on creation)
-- ─────────────────────────────────────────────────────────────
create table public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  prefix        text not null,                -- first chars, for display: dfm_live_ab12…
  key_hash      text not null unique,         -- sha256 hex
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index on public.api_keys (workspace_id);

-- ─────────────────────────────────────────────────────────────
-- Sending domains (verified per workspace in SES)
-- ─────────────────────────────────────────────────────────────
create table public.sending_domains (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  domain        extensions.citext not null,
  status        text not null default 'pending' check (status in ('pending','verified','failed')),
  dns_records   jsonb not null default '[]'::jsonb,
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (workspace_id, domain)
);

-- ─────────────────────────────────────────────────────────────
-- Contacts, lists
-- ─────────────────────────────────────────────────────────────
create table public.contacts (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  email            extensions.citext not null,
  first_name       text,
  last_name        text,
  external_id      text,                                  -- id in the calling app (e.g. ArgusIQ member id)
  fields           jsonb not null default '{}'::jsonb,    -- custom merge fields
  tags             text[] not null default '{}',
  status           text not null default 'subscribed'
                   check (status in ('subscribed','unsubscribed','bounced','complained','pending')),
  consent_source   text,                                  -- where consent came from (form, import, api, …)
  consented_at     timestamptz,
  unsubscribed_at  timestamptz,
  unsub_token      text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (workspace_id, email)
);
create index on public.contacts (workspace_id, status);
create index on public.contacts using gin (tags);
create unique index on public.contacts (unsub_token);
create index on public.contacts (workspace_id, external_id) where external_id is not null;

create table public.lists (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  description   text,
  double_opt_in boolean not null default true,
  created_at    timestamptz not null default now()
);
create index on public.lists (workspace_id);

create table public.list_members (
  list_id       uuid not null references public.lists(id) on delete cascade,
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  status        text not null default 'subscribed' check (status in ('pending','subscribed','unsubscribed')),
  added_at      timestamptz not null default now(),
  primary key (list_id, contact_id)
);
create index on public.list_members (contact_id);
create index on public.list_members (workspace_id);

-- ─────────────────────────────────────────────────────────────
-- Templates & campaigns
-- ─────────────────────────────────────────────────────────────
create table public.templates (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  subject       text not null default '',
  html          text not null default '',
  text          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.templates (workspace_id);

create table public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  name           text not null,
  subject        text not null,
  from_name      text not null,
  from_email     extensions.citext not null,
  reply_to       text,
  html           text not null,
  text           text,
  template_id    uuid references public.templates(id) on delete set null,
  list_id        uuid references public.lists(id) on delete set null,
  tag_filter     text[] not null default '{}',     -- contact must have ALL of these tags
  status         text not null default 'draft'
                 check (status in ('draft','scheduled','sending','sent','paused','failed','cancelled')),
  scheduled_at   timestamptz,
  started_at     timestamptz,
  completed_at   timestamptz,
  recipient_count integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.campaigns (workspace_id, status);
create index on public.campaigns (list_id);
create index on public.campaigns (template_id);

-- ─────────────────────────────────────────────────────────────
-- Messages: one row per recipient per send. This table IS the send queue.
-- ─────────────────────────────────────────────────────────────
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  campaign_id     uuid references public.campaigns(id) on delete cascade,
  contact_id      uuid references public.contacts(id) on delete set null,
  kind            text not null check (kind in ('campaign','transactional')),
  to_email        extensions.citext not null,
  from_header     text not null,
  reply_to        text,
  subject         text not null,
  html            text,
  text            text,
  headers         jsonb not null default '{}'::jsonb,
  status          text not null default 'queued'
                  check (status in ('queued','sending','sent','delivered','bounced','complained','failed','suppressed')),
  ses_message_id  text,
  attempts        integer not null default 0,
  last_error      text,
  send_after      timestamptz not null default now(),
  sent_at         timestamptz,
  delivered_at    timestamptz,
  opened_at       timestamptz,
  clicked_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index messages_queue_idx on public.messages (send_after) where status = 'queued';
create index on public.messages (workspace_id, created_at desc);
create index on public.messages (campaign_id);
create index on public.messages (contact_id);
create unique index on public.messages (ses_message_id) where ses_message_id is not null;

create table public.events (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  message_id    uuid references public.messages(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete set null,
  type          text not null check (type in ('sent','delivered','open','click','bounce','complaint','unsubscribe','reject','failed')),
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index on public.events (workspace_id, created_at desc);
create index on public.events (message_id);
create index on public.events (contact_id);

-- ─────────────────────────────────────────────────────────────
-- Suppressions. Per-workspace, plus a global list for hard bounces and
-- complaints so one tenant's bad address never hurts the shared pool.
-- ─────────────────────────────────────────────────────────────
create table public.suppressions (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  email         extensions.citext not null,
  reason        text not null check (reason in ('bounce','complaint','unsubscribe','manual')),
  created_at    timestamptz not null default now(),
  primary key (workspace_id, email)
);

create table public.global_suppressions (
  email       extensions.citext primary key,
  reason      text not null check (reason in ('hard_bounce','complaint')),
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Usage metering
-- ─────────────────────────────────────────────────────────────
create table public.usage_daily (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  day           date not null,
  sends         integer not null default 0,
  primary key (workspace_id, day)
);

create table public.usage_monthly (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  period        date not null,       -- first day of month
  sends         integer not null default 0,
  primary key (workspace_id, period)
);

-- ─────────────────────────────────────────────────────────────
-- Outbound webhooks to customer apps
-- ─────────────────────────────────────────────────────────────
create table public.webhook_endpoints (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  url           text not null,
  secret        text not null,
  events        text[] not null default '{}',   -- empty = all
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index on public.webhook_endpoints (workspace_id);

create table public.webhook_deliveries (
  id               uuid primary key default gen_random_uuid(),
  endpoint_id      uuid not null references public.webhook_endpoints(id) on delete cascade,
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  event_type       text not null,
  payload          jsonb not null,
  status           text not null default 'pending' check (status in ('pending','delivered','failed')),
  attempts         integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  response_code    integer,
  last_error       text,
  created_at       timestamptz not null default now()
);
create index webhook_deliveries_queue_idx on public.webhook_deliveries (next_attempt_at) where status = 'pending';
create index on public.webhook_deliveries (endpoint_id);
create index on public.webhook_deliveries (workspace_id);

-- ─────────────────────────────────────────────────────────────
-- Queue & metering functions (service role only)
-- ─────────────────────────────────────────────────────────────

-- Atomically claim a batch of queued messages for sending.
create or replace function public.claim_messages(batch_size integer default 50)
returns setof public.messages
language sql security definer set search_path = ''
as $$
  update public.messages m
  set status = 'sending', attempts = m.attempts + 1
  where m.id in (
    select q.id from public.messages q
    join public.workspaces w on w.id = q.workspace_id
    where q.status = 'queued' and q.send_after <= now() and w.status = 'active'
    order by q.send_after
    limit batch_size
    for update of q skip locked
  )
  returning m.*;
$$;

create or replace function public.claim_webhook_deliveries(batch_size integer default 50)
returns setof public.webhook_deliveries
language sql security definer set search_path = ''
as $$
  update public.webhook_deliveries d
  set attempts = d.attempts + 1,
      next_attempt_at = now() + interval '5 minutes'   -- lease; overwritten on completion
  where d.id in (
    select q.id from public.webhook_deliveries q
    where q.status = 'pending' and q.next_attempt_at <= now()
    order by q.next_attempt_at
    limit batch_size
    for update skip locked
  )
  returning d.*;
$$;

create or replace function public.record_sends(ws uuid, n integer)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.usage_daily (workspace_id, day, sends)
  values (ws, (now() at time zone 'Australia/Brisbane')::date, n)
  on conflict (workspace_id, day) do update set sends = public.usage_daily.sends + excluded.sends;
  insert into public.usage_monthly (workspace_id, period, sends)
  values (ws, date_trunc('month', now() at time zone 'Australia/Brisbane')::date, n)
  on conflict (workspace_id, period) do update set sends = public.usage_monthly.sends + excluded.sends;
$$;

-- Reputation stats over the last 30 days (for auto-pause).
create or replace function public.workspace_reputation(ws uuid)
returns table (sent bigint, bounces bigint, complaints bigint)
language sql stable security definer set search_path = ''
as $$
  select
    count(*) filter (where status in ('sent','delivered','bounced','complained')),
    count(*) filter (where status = 'bounced'),
    count(*) filter (where status = 'complained')
  from public.messages
  where workspace_id = ws and created_at > now() - interval '30 days';
$$;

revoke execute on function public.claim_messages(integer) from public, anon, authenticated;
revoke execute on function public.claim_webhook_deliveries(integer) from public, anon, authenticated;
revoke execute on function public.record_sends(uuid, integer) from public, anon, authenticated;
revoke execute on function public.workspace_reputation(uuid) from public, anon, authenticated;
revoke execute on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;

-- updated_at triggers
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;

create trigger contacts_touch before update on public.contacts for each row execute function public.touch_updated_at();
create trigger templates_touch before update on public.templates for each row execute function public.touch_updated_at();
create trigger campaigns_touch before update on public.campaigns for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Row level security. The API and worker use the service role (bypasses RLS);
-- these policies govern the dashboard's signed-in users.
-- ─────────────────────────────────────────────────────────────
alter table public.plans               enable row level security;
alter table public.workspaces          enable row level security;
alter table public.workspace_members   enable row level security;
alter table public.api_keys            enable row level security;
alter table public.sending_domains     enable row level security;
alter table public.contacts            enable row level security;
alter table public.lists               enable row level security;
alter table public.list_members        enable row level security;
alter table public.templates           enable row level security;
alter table public.campaigns           enable row level security;
alter table public.messages            enable row level security;
alter table public.events              enable row level security;
alter table public.suppressions        enable row level security;
alter table public.global_suppressions enable row level security;   -- no policies: service role only
alter table public.usage_daily         enable row level security;
alter table public.usage_monthly       enable row level security;
alter table public.webhook_endpoints   enable row level security;
alter table public.webhook_deliveries  enable row level security;

create policy plans_read on public.plans for select to anon, authenticated using (true);

create policy ws_read   on public.workspaces for select to authenticated using (public.is_member(id));
create policy ws_update on public.workspaces for update to authenticated using (public.is_admin(id)) with check (public.is_admin(id));

create policy members_read on public.workspace_members for select to authenticated using (public.is_member(workspace_id));
create policy members_admin on public.workspace_members for all to authenticated
  using (public.is_admin(workspace_id)) with check (public.is_admin(workspace_id));

-- Read-only to members (writes go through the server).
create policy api_keys_read on public.api_keys for select to authenticated using (public.is_member(workspace_id));
create policy domains_read  on public.sending_domains for select to authenticated using (public.is_member(workspace_id));
create policy messages_read on public.messages for select to authenticated using (public.is_member(workspace_id));
create policy events_read   on public.events for select to authenticated using (public.is_member(workspace_id));
create policy usage_d_read  on public.usage_daily for select to authenticated using (public.is_member(workspace_id));
create policy usage_m_read  on public.usage_monthly for select to authenticated using (public.is_member(workspace_id));
create policy whd_read      on public.webhook_deliveries for select to authenticated using (public.is_member(workspace_id));
create policy supp_read     on public.suppressions for select to authenticated using (public.is_member(workspace_id));

-- Full CRUD to members.
create policy contacts_all  on public.contacts for all to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy lists_all     on public.lists for all to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy lm_all        on public.list_members for all to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy templates_all on public.templates for all to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy campaigns_rw  on public.campaigns for select to authenticated using (public.is_member(workspace_id));
create policy campaigns_ins on public.campaigns for insert to authenticated with check (public.is_member(workspace_id) and status = 'draft');
create policy campaigns_upd on public.campaigns for update to authenticated
  using (public.is_member(workspace_id) and status = 'draft') with check (public.is_member(workspace_id) and status = 'draft');
create policy campaigns_del on public.campaigns for delete to authenticated using (public.is_member(workspace_id) and status = 'draft');
create policy whe_all       on public.webhook_endpoints for all to authenticated using (public.is_admin(workspace_id)) with check (public.is_admin(workspace_id));
