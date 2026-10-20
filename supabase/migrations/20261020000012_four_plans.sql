update public.plans set name = case id when 'free' then 'Free' when 'starter' then 'Tadpole' when 'club' then 'Leaper (retired)' when 'growth' then 'Bullfrog' when 'pro' then 'King Frog' end;
update public.plans set sort = 99 where id = 'club';
