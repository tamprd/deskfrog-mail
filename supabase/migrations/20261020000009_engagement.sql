-- Per-recipient engagement counts, link stats, and "resend to non-openers".

alter table public.messages add column open_count integer not null default 0;
alter table public.messages add column click_count integer not null default 0;

-- A resend targets only people who received `resend_of` and haven't opened it.
alter table public.campaigns add column resend_of uuid references public.campaigns(id) on delete set null;
create index on public.campaigns (resend_of);
create index messages_campaign_contact_idx on public.messages (campaign_id, contact_id);

-- Superseded by record_engagement below (its `kind` param clashes with messages.kind). Kept for history.
create or replace function public.bump_engagement(mid uuid, kind text, at timestamptz)
returns void
language sql security definer set search_path = ''
as $$
  update public.messages set
    open_count  = open_count  + case when kind = 'open'  then 1 else 0 end,
    click_count = click_count + case when kind = 'click' then 1 else 0 end,
    opened_at   = case when kind = 'open'  then coalesce(opened_at, at)  else opened_at end,
    -- a click implies the email was opened
    clicked_at  = case when kind = 'click' then coalesce(clicked_at, at) else clicked_at end
  where id = mid;
$$;

-- Clicks per link for a campaign.
create or replace function public.campaign_links(cid uuid)
returns table (link text, clicks bigint, people bigint)
language sql stable security definer set search_path = ''
as $$
  select e.data->>'link', count(*), count(distinct e.contact_id)
  from public.events e
  join public.messages m on m.id = e.message_id
  where m.campaign_id = cid and e.type = 'click' and e.data ? 'link'
  group by 1
  order by 2 desc
  limit 200;
$$;

create or replace function public.enqueue_campaign(cid uuid, from_hdr text, max_recipients integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  c public.campaigns;
  n integer;
begin
  select * into c from public.campaigns where id = cid for update;
  if not found then raise exception 'campaign not found'; end if;
  if c.status not in ('draft','scheduled') then raise exception 'campaign is %', c.status; end if;

  with ins as (
    insert into public.messages (workspace_id, campaign_id, contact_id, kind, to_email, from_header, reply_to, subject)
    select c.workspace_id, c.id, ct.id, 'campaign', ct.email, from_hdr, c.reply_to, c.subject
    from public.contacts ct
    where ct.workspace_id = c.workspace_id
      and ct.status = 'subscribed'
      and (c.list_id is null or exists (
            select 1 from public.list_members lm
            where lm.list_id = c.list_id and lm.contact_id = ct.id and lm.status = 'subscribed'))
      and ct.tags @> c.tag_filter
      and (c.resend_of is null or exists (
            select 1 from public.messages om
            where om.campaign_id = c.resend_of and om.contact_id = ct.id
              and om.status in ('sent','delivered') and om.opened_at is null and om.clicked_at is null))
      and not exists (select 1 from public.suppressions s where s.workspace_id = c.workspace_id and s.email = ct.email)
      and not exists (select 1 from public.global_suppressions g where g.email = ct.email)
    returning 1
  )
  select count(*) into n from ins;

  -- Raising here rolls back the insert above.
  if n > max_recipients then
    raise exception 'send limit exceeded: campaign needs % sends, you have % left', n, max_recipients
      using errcode = 'P0001', hint = 'limit';
  end if;

  update public.campaigns
  set status = case when n = 0 then 'sent' else 'sending' end,
      started_at = now(),
      completed_at = case when n = 0 then now() else null end,
      recipient_count = n
  where id = cid;

  return n;
end;
$$;

-- Atomic counters used by the SES event handler (params prefixed to avoid clashing with column names).
create or replace function public.record_engagement(p_message uuid, p_kind text, p_at timestamptz)
returns void
language sql security definer set search_path = ''
as $$
  update public.messages m set
    open_count  = m.open_count  + case when p_kind = 'open'  then 1 else 0 end,
    click_count = m.click_count + case when p_kind = 'click' then 1 else 0 end,
    opened_at   = case when p_kind = 'open'  then coalesce(m.opened_at, p_at)  else m.opened_at end,
    clicked_at  = case when p_kind = 'click' then coalesce(m.clicked_at, p_at) else m.clicked_at end
  where m.id = p_message;
$$;
revoke execute on function public.record_engagement(uuid, text, timestamptz) from public, anon, authenticated;

revoke execute on function public.bump_engagement(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.campaign_links(uuid) from public, anon, authenticated;
revoke execute on function public.enqueue_campaign(uuid, text, integer) from public, anon, authenticated;

-- "Opened" includes anyone who clicked (a click implies an open, even when the open pixel was blocked).
create or replace function public.campaign_stats(cid uuid)
returns table (recipients bigint, sent bigint, delivered bigint, bounced bigint, complained bigint,
               opened bigint, clicked bigint, failed bigint, suppressed bigint, unsubscribed bigint)
language sql stable security definer set search_path = ''
as $$
  select
    count(*),
    count(*) filter (where m.status in ('sent','delivered','bounced','complained')),
    count(*) filter (where m.status = 'delivered' or m.delivered_at is not null),
    count(*) filter (where m.status = 'bounced'),
    count(*) filter (where m.status = 'complained'),
    count(*) filter (where m.opened_at is not null or m.clicked_at is not null),
    count(*) filter (where m.clicked_at is not null),
    count(*) filter (where m.status = 'failed'),
    count(*) filter (where m.status = 'suppressed'),
    (select count(distinct e.contact_id) from public.events e
       join public.messages mm on mm.id = e.message_id
       where mm.campaign_id = cid and e.type = 'unsubscribe')
  from public.messages m
  where m.campaign_id = cid;
$$;
revoke execute on function public.campaign_stats(uuid) from public, anon, authenticated;
