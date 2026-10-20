update public.plans p set name = v.name, price_cents = v.price, contact_limit = v.contacts, monthly_send_limit = v.sends, daily_send_limit = greatest(p.daily_send_limit, v.sends / 3)
from (values ('free','Tadpole',0,250,1000),('starter','Hopper',1900,2500,15000),('club','Leaper',3900,5000,30000),('growth','Bullfrog',5900,10000,60000),('pro','King Frog',12900,25000,150000)) as v(id,name,price,contacts,sends)
where p.id = v.id;
