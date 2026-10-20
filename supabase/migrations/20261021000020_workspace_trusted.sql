alter table public.workspaces add column if not exists trusted boolean not null default false;
comment on column public.workspaces.trusted is 'Skips the first-week 100/day new-account cap.';
update public.workspaces set trusted = true where id = '38299bce-bdcd-4a28-bf78-d1aad922dfc5';
