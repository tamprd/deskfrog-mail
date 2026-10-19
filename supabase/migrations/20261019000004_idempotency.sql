alter table public.messages add column idempotency_key text;
create unique index messages_idempotency_idx on public.messages (workspace_id, idempotency_key) where idempotency_key is not null;
