-- Block-based email designs (JSON) + per-workspace brand kit + image bucket.
alter table public.campaigns add column design jsonb;
alter table public.templates add column design jsonb;
alter table public.workspaces add column brand jsonb not null default '{}'::jsonb;

-- Public-read bucket for email images (emails need public URLs). Uploads go through the server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-assets', 'email-assets', true, 5242880, array['image/png','image/jpeg','image/gif','image/webp'])
on conflict (id) do nothing;
