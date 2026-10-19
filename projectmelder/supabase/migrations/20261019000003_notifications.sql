-- ProjectMelder – pushberichten en termijnbewaking.
-- Vereist de extensies pg_net en pg_cron en twee geheimen in Supabase Vault:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service_role key>', 'service_role_key');
-- Zolang die geheimen ontbreken, worden aanroepen overgeslagen (er gaat niets mis).

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function public.call_edge_function(p_name text, p_body jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then
    raise notice 'Vault-geheimen project_url/service_role_key ontbreken; % niet aangeroepen', p_name;
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := p_body
  );
end $$;

revoke execute on function public.call_edge_function from public, anon, authenticated;

create or replace function public.notify_item_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.call_edge_function('notify', jsonb_build_object('kind', 'item_created', 'id', new.id));
  elsif new.owner_id is distinct from old.owner_id then
    perform public.call_edge_function('notify', jsonb_build_object('kind', 'item_owner', 'id', new.id));
  elsif new.status is distinct from old.status then
    perform public.call_edge_function('notify', jsonb_build_object(
      'kind', 'item_status', 'id', new.id, 'actor_id', auth.uid(), 'from', old.status, 'to', new.status));
  end if;
  return new;
end $$;

create trigger items_notify after insert or update of owner_id, status on public.items
  for each row execute function public.notify_item_change();

create or replace function public.notify_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind <> 'systeem' then
    perform public.call_edge_function('notify', jsonb_build_object('kind', 'message', 'id', new.id));
  end if;
  return new;
end $$;

create trigger messages_notify after insert on public.messages
  for each row execute function public.notify_message();

-- Termijnbewaking elk kwartier
select cron.schedule(
  'projectmelder-reminders',
  '*/15 * * * *',
  $$ select public.call_edge_function('reminders', '{}'::jsonb) $$
);
