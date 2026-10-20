alter table public.workspaces alter column referral_code set default encode(gen_random_bytes(4), 'hex');
update public.workspaces set referral_code = encode(gen_random_bytes(4), 'hex') where referral_code is null;
