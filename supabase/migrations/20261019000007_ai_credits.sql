-- Monthly AI credit metering. Per-plan limits live in code (src/lib/ai/credits.ts).
alter table public.usage_monthly add column ai_calls integer not null default 0;

-- Atomically consume one AI credit against `lim`; returns false when the monthly limit is reached.
create or replace function public.use_ai_credit(ws uuid, lim integer)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  p date := date_trunc('month', now() at time zone 'Australia/Brisbane')::date;
  used integer;
begin
  insert into public.usage_monthly (workspace_id, period, sends, ai_calls) values (ws, p, 0, 0)
  on conflict (workspace_id, period) do nothing;
  update public.usage_monthly u set ai_calls = u.ai_calls + 1
  where u.workspace_id = ws and u.period = p and u.ai_calls < lim
  returning u.ai_calls into used;
  return used is not null;
end;
$$;

create or replace function public.refund_ai_credit(ws uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.usage_monthly set ai_calls = greatest(ai_calls - 1, 0)
  where workspace_id = ws and period = date_trunc('month', now() at time zone 'Australia/Brisbane')::date;
$$;

revoke execute on function public.use_ai_credit(uuid, integer) from public, anon, authenticated;
revoke execute on function public.refund_ai_credit(uuid) from public, anon, authenticated;
