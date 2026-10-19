-- How a campaign's content is authored:
--   design = block editor (JSON design rendered via MJML)
--   html   = raw HTML sent exactly as written
--   text   = plain-text only email
alter table public.campaigns add column format text not null default 'design' check (format in ('design','html','text'));
