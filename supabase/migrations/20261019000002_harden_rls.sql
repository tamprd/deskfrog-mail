-- Move RLS helpers out of the exposed API schema; workspace creation goes through the server.
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_member(ws uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.workspace_members m
                 where m.workspace_id = ws and m.user_id = (select auth.uid()));
$$;

create or replace function private.is_admin(ws uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.workspace_members m
                 where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.role in ('owner','admin'));
$$;

revoke execute on function private.is_member(uuid) from public, anon;
revoke execute on function private.is_admin(uuid) from public, anon;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.is_admin(uuid) to authenticated;

-- Recreate every policy against the private helpers.
drop policy ws_read on public.workspaces;
drop policy ws_update on public.workspaces;
drop policy members_read on public.workspace_members;
drop policy members_admin on public.workspace_members;
drop policy api_keys_read on public.api_keys;
drop policy domains_read on public.sending_domains;
drop policy messages_read on public.messages;
drop policy events_read on public.events;
drop policy usage_d_read on public.usage_daily;
drop policy usage_m_read on public.usage_monthly;
drop policy whd_read on public.webhook_deliveries;
drop policy supp_read on public.suppressions;
drop policy contacts_all on public.contacts;
drop policy lists_all on public.lists;
drop policy lm_all on public.list_members;
drop policy templates_all on public.templates;
drop policy campaigns_rw on public.campaigns;
drop policy campaigns_ins on public.campaigns;
drop policy campaigns_upd on public.campaigns;
drop policy campaigns_del on public.campaigns;
drop policy whe_all on public.webhook_endpoints;

drop function public.is_member(uuid);
drop function public.is_admin(uuid);
drop function public.create_workspace(text);

create policy ws_read   on public.workspaces for select to authenticated using (private.is_member(id));
create policy ws_update on public.workspaces for update to authenticated using (private.is_admin(id)) with check (private.is_admin(id));

create policy members_read   on public.workspace_members for select to authenticated using (private.is_member(workspace_id));
create policy members_insert on public.workspace_members for insert to authenticated with check (private.is_admin(workspace_id));
create policy members_update on public.workspace_members for update to authenticated using (private.is_admin(workspace_id)) with check (private.is_admin(workspace_id));
create policy members_delete on public.workspace_members for delete to authenticated using (private.is_admin(workspace_id));

create policy api_keys_read on public.api_keys for select to authenticated using (private.is_member(workspace_id));
create policy domains_read  on public.sending_domains for select to authenticated using (private.is_member(workspace_id));
create policy messages_read on public.messages for select to authenticated using (private.is_member(workspace_id));
create policy events_read   on public.events for select to authenticated using (private.is_member(workspace_id));
create policy usage_d_read  on public.usage_daily for select to authenticated using (private.is_member(workspace_id));
create policy usage_m_read  on public.usage_monthly for select to authenticated using (private.is_member(workspace_id));
create policy whd_read      on public.webhook_deliveries for select to authenticated using (private.is_member(workspace_id));
create policy supp_read     on public.suppressions for select to authenticated using (private.is_member(workspace_id));

create policy contacts_all  on public.contacts for all to authenticated using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
create policy lists_all     on public.lists for all to authenticated using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
create policy lm_all        on public.list_members for all to authenticated using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
create policy templates_all on public.templates for all to authenticated using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
create policy campaigns_read on public.campaigns for select to authenticated using (private.is_member(workspace_id));
create policy campaigns_ins on public.campaigns for insert to authenticated with check (private.is_member(workspace_id) and status = 'draft');
create policy campaigns_upd on public.campaigns for update to authenticated
  using (private.is_member(workspace_id) and status = 'draft') with check (private.is_member(workspace_id) and status = 'draft');
create policy campaigns_del on public.campaigns for delete to authenticated using (private.is_member(workspace_id) and status = 'draft');
create policy whe_all       on public.webhook_endpoints for all to authenticated using (private.is_admin(workspace_id)) with check (private.is_admin(workspace_id));

-- Deliberately no policies: only the service role touches the global suppression list.
comment on table public.global_suppressions is 'Service-role only. Hard bounces and complaints suppressed across all workspaces.';

create index on public.workspaces (plan_id);
