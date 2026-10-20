-- Pricing v2 (AUD, GST inclusive): add a 5,000-contact Club tier; cap Pro at 200k sends to protect margin.
insert into public.plans (id, name, price_cents, contact_limit, monthly_send_limit, daily_send_limit, badge_required, custom_domain, automations, sort)
values ('club', 'Club', 2500, 5000, 30000, 10000, false, true, false, 15)
on conflict (id) do nothing;

update public.plans set monthly_send_limit = 200000 where id = 'pro';
update public.plans set sort = 10 where id = 'starter';
update public.plans set sort = 20 where id = 'growth';
update public.plans set sort = 30 where id = 'pro';
update public.plans set contact_limit = 250 where id = 'free';
