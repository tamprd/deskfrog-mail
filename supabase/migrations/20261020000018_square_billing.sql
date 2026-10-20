alter table public.plans
  add column if not exists square_plan_id text,
  add column if not exists square_monthly_id text,
  add column if not exists square_annual_id text;

alter table public.workspaces
  add column if not exists square_customer_id text,
  add column if not exists square_subscription_id text,
  add column if not exists square_card_id text,
  add column if not exists billing_cycle text check (billing_cycle in ('monthly','annual')),
  add column if not exists subscription_status text,
  add column if not exists card_brand text,
  add column if not exists card_last4 text,
  add column if not exists card_exp text,
  add column if not exists cancel_at date,
  add column if not exists paid_through date;

create table if not exists public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  square_invoice_id  text unique,
  square_payment_id  text,
  description        text,
  amount_cents       integer not null default 0,
  status             text not null default 'paid',
  paid_at            timestamptz,
  receipt_url        text,
  created_at         timestamptz not null default now()
);
create index if not exists invoices_ws on public.invoices (workspace_id, created_at desc);
alter table public.invoices enable row level security;
create policy "members read invoices" on public.invoices for select to authenticated using (private.is_member(workspace_id));
