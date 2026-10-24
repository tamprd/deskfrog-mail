-- Public signup forms: embed on any website, no API key in the browser.
create table public.signup_forms (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  list_id          uuid references public.lists(id) on delete set null,
  name             text not null,
  public_key       text not null default 'frm_' || encode(gen_random_bytes(12), 'hex'),
  allowed_origins  text[] not null default '{}',   -- e.g. {https://lapthelake.com.au}; empty = any site
  tags             text[] not null default '{}',   -- added to every contact from this form
  double_opt_in    boolean not null default true,
  redirect_url     text,                            -- for plain (no-JS) HTML form posts
  enabled          boolean not null default true,
  submissions      integer not null default 0,
  last_submitted_at timestamptz,
  created_at       timestamptz not null default now()
);
create unique index on public.signup_forms (public_key);
create index on public.signup_forms (workspace_id);
alter table public.signup_forms enable row level security;
create policy "members read forms" on public.signup_forms for select to authenticated using (private.is_member(workspace_id));

-- Double opt-in: one row per pending confirmation.
create table public.form_confirmations (
  token         text primary key default encode(gen_random_bytes(24), 'hex'),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  form_id       uuid references public.signup_forms(id) on delete set null,
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  list_id       uuid references public.lists(id) on delete set null,
  consent_source text,
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz
);
create index on public.form_confirmations (contact_id);
alter table public.form_confirmations enable row level security;

-- Light per-IP rate limiting for the public endpoint (IP stored hashed).
create table public.form_hits (
  form_id    uuid not null references public.signup_forms(id) on delete cascade,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);
create index on public.form_hits (form_id, ip_hash, created_at desc);
alter table public.form_hits enable row level security;

-- Count a submission (called by the public endpoint with the service role).
create or replace function public.record_form_submission(p_form_id uuid)
returns void language sql security definer set search_path = ''
as $$
  update public.signup_forms set submissions = submissions + 1, last_submitted_at = now() where id = p_form_id;
$$;
revoke execute on function public.record_form_submission(uuid) from public, anon, authenticated;
grant execute on function public.record_form_submission(uuid) to service_role;
