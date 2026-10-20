update public.plans set name = case id
  when 'free' then 'Tadpole' when 'starter' then 'Hopper' when 'club' then 'Leaper'
  when 'growth' then 'Bullfrog' when 'pro' then 'King Frog' else name end;
