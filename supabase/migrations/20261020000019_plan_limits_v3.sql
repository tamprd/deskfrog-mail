update public.plans p set contact_limit = v.c, monthly_send_limit = v.s, daily_send_limit = greatest(v.s / 3, 1000)
from (values ('starter', 1500, 9000), ('growth', 5000, 30000), ('pro', 15000, 90000)) as v(id, c, s) where p.id = v.id;
update public.plans set contact_limit = 500, monthly_send_limit = 3000, daily_send_limit = 1000 where id = 'starter';
