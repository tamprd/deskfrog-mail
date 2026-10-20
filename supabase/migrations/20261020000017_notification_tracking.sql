alter table public.campaigns add column if not exists report_sent_at timestamptz;
alter table public.workspaces add column if not exists draft_nudged_at timestamptz;
