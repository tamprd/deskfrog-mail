alter table public.sender_addresses add column if not exists ses_verified_at timestamptz;
