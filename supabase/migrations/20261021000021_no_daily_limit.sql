-- Plans have a monthly send limit only; daily_send_limit is kept equal to it for reference.
update public.plans set daily_send_limit = monthly_send_limit;
