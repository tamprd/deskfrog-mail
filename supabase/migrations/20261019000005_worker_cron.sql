-- Worker schedule. Secrets live in Supabase Vault (not in this file):
--   select vault.create_secret('<CRON_SECRET>', 'deskfrog_cron_secret');
--   select vault.create_secret('https://<host>/api/cron/worker', 'deskfrog_worker_url');
-- To move hosts later: update the deskfrog_worker_url secret, nothing else.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('deskfrog-worker', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'deskfrog_worker_url'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'deskfrog_cron_secret')),
    timeout_milliseconds := 60000
  );
$$);

select cron.schedule('deskfrog-net-cleanup', '17 3 * * *', $$ delete from net._http_response where created < now() - interval '1 day'; $$);
