alter table public.workspaces
  add column if not exists contact_name text,
  add column if not exists company text,
  add column if not exists contact_email text,
  add column if not exists phone text,
  add column if not exists abn text,
  add column if not exists notify jsonb not null default '{}'::jsonb,
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references public.workspaces(id) on delete set null,
  add column if not exists paused_at timestamptz,
  add column if not exists last_export_at timestamptz;
create unique index if not exists workspaces_referral_code_key on public.workspaces (referral_code);

alter table public.lists
  add column if not exists from_name text,
  add column if not exists from_email text,
  add column if not exists postal_address text,
  add column if not exists permission_reminder text;

alter table public.api_keys add column if not exists expires_at timestamptz;

create table if not exists public.referral_credits (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  referred_id   uuid references public.workspaces(id) on delete set null,
  amount_cents  integer not null,
  status        text not null default 'pending' check (status in ('pending','earned','used')),
  created_at    timestamptz not null default now()
);
create index if not exists referral_credits_ws on public.referral_credits (workspace_id);
alter table public.referral_credits enable row level security;
create policy "members read credits" on public.referral_credits for select to authenticated using (private.is_member(workspace_id));
