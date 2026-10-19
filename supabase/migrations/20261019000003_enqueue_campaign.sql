-- Expand a campaign into one queued message per eligible recipient.
-- Personalisation happens at send time; the message row only pins the recipient.
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

  with recipients as (
    select ct.id, ct.email
    from public.contacts ct
    where ct.workspace_id = c.workspace_id
      and ct.status = 'subscribed'
      and (c.list_id is null or exists (
            select 1 from public.list_members lm
            where lm.list_id = c.list_id and lm.contact_id = ct.id and lm.status = 'subscribed'))
      and ct.tags @> c.tag_filter
      and not exists (select 1 from public.suppressions s where s.workspace_id = c.workspace_id and s.email = ct.email)
      and not exists (select 1 from public.global_suppressions g where g.email = ct.email)
    limit max_recipients + 1
  )
  select count(*) into n from recipients;

  if n > max_recipients then
    raise exception 'send limit exceeded: campaign needs more than % sends', max_recipients
      using errcode = 'P0001', hint = 'limit';
  end if;

  insert into public.messages (workspace_id, campaign_id, contact_id, kind, to_email, from_header, reply_to, subject)
  select c.workspace_id, c.id, ct.id, 'campaign', ct.email, from_hdr, c.reply_to, c.subject
  from public.contacts ct
  where ct.workspace_id = c.workspace_id
    and ct.status = 'subscribed'
    and (c.list_id is null or exists (
          select 1 from public.list_members lm
          where lm.list_id = c.list_id and lm.contact_id = ct.id and lm.status = 'subscribed'))
    and ct.tags @> c.tag_filter
    and not exists (select 1 from public.suppressions s where s.workspace_id = c.workspace_id and s.email = ct.email)
    and not exists (select 1 from public.global_suppressions g where g.email = ct.email);

  get diagnostics n = row_count;

  update public.campaigns
  set status = case when n = 0 then 'sent' else 'sending' end,
      started_at = now(),
      completed_at = case when n = 0 then now() else null end,
      recipient_count = n
  where id = cid;

  return n;
end;
$$;

-- Mark campaigns complete once nothing is left in flight.
create or replace function public.complete_campaigns()
returns void
language sql security definer set search_path = ''
as $$
  update public.campaigns c
  set status = 'sent', completed_at = now()
  where c.status = 'sending'
    and not exists (select 1 from public.messages m
                    where m.campaign_id = c.id and m.status in ('queued','sending'));
$$;

-- Per-campaign stats.
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
    count(*) filter (where m.opened_at is not null),
    count(*) filter (where m.clicked_at is not null),
    count(*) filter (where m.status = 'failed'),
    count(*) filter (where m.status = 'suppressed'),
    (select count(distinct e.contact_id) from public.events e
       join public.messages mm on mm.id = e.message_id
       where mm.campaign_id = cid and e.type = 'unsubscribe')
  from public.messages m
  where m.campaign_id = cid;
$$;

revoke execute on function public.enqueue_campaign(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.complete_campaigns() from public, anon, authenticated;
revoke execute on function public.campaign_stats(uuid) from public, anon, authenticated;
