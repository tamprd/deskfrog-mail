create table public.sender_addresses (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email        text not null,
  name         text,
  token        text not null default encode(gen_random_bytes(24), 'hex'),
  verified_at  timestamptz,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (workspace_id, email)
);
create unique index on public.sender_addresses (token);
alter table public.sender_addresses enable row level security;
create policy "members read senders" on public.sender_addresses for select to authenticated using (private.is_member(workspace_id));
