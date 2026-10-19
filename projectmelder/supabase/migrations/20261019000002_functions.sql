-- ProjectMelder – functies (RPC) voor beheer en wijzigingen met audit trail.

-- ---------------------------------------------------------------- weergaven

create or replace view public.member_directory with (security_invoker = true) as
  select m.project_id, m.user_id, m.role, m.organisation_id, m.active,
         p.full_name, p.phone, p.job_title,
         o.name as organisation_name, o.kind as organisation_kind
  from public.project_members m
  join public.profiles p on p.id = m.user_id
  left join public.organisations o on o.id = m.organisation_id;

-- ---------------------------------------------------------------- organisatie en projecten

-- Eerste gebruiker richt de eigen organisatie in en wordt beheerder.
create or replace function public.bootstrap_organisation(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
  if exists (select 1 from public.organisations where kind = 'eigen') then
    raise exception 'De eigen organisatie is al ingericht';
  end if;
  insert into public.organisations (name, kind) values (p_name, 'eigen') returning id into v_id;
  update public.profiles set organisation_id = v_id, is_admin = true where id = auth.uid();
  return v_id;
end $$;

create or replace function public.create_organisation(p_name text, p_kind text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (
    select 1 from public.profiles p join public.organisations o on o.id = p.organisation_id
    where p.id = auth.uid() and o.kind = 'eigen') then
    raise exception 'Alleen medewerkers van de eigen organisatie kunnen organisaties toevoegen';
  end if;
  select id into v_id from public.organisations where lower(name) = lower(p_name) and kind = p_kind;
  if v_id is null then
    insert into public.organisations (name, kind) values (p_name, p_kind) returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.create_project(
  p_code text, p_name text, p_client text, p_location text, p_role public.member_role)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_org uuid;
begin
  select p.organisation_id into v_org from public.profiles p
    join public.organisations o on o.id = p.organisation_id
    where p.id = auth.uid() and o.kind = 'eigen';
  if v_org is null then raise exception 'Alleen de eigen organisatie kan projecten aanmaken'; end if;
  if p_role not in ('projectleider', 'werkvoorbereider') then
    raise exception 'Projecten worden aangemaakt door een projectleider of werkvoorbereider';
  end if;
  insert into public.projects (code, name, client, location)
    values (upper(trim(p_code)), trim(p_name), nullif(trim(p_client), ''), nullif(trim(p_location), ''))
    returning id into v_id;
  insert into public.project_members (project_id, user_id, role, organisation_id)
    values (v_id, auth.uid(), p_role, v_org);
  insert into public.channels (project_id, name, kind) values
    (v_id, 'Algemeen', 'algemeen'),
    (v_id, 'Intern team', 'intern');
  return v_id;
end $$;

-- Uitnodigen op telefoonnummer (nummerherkenning bij eerste inlog)
create or replace function public.invite_member(
  p_project uuid, p_phone text, p_name text, p_role public.member_role, p_org uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_phone text := public.normalize_phone(p_phone);
  v_kind text;
  v_user uuid;
  v_org_name text;
begin
  select kind, name into v_kind, v_org_name from public.organisations where id = p_org;
  if v_kind is null then raise exception 'Onbekende organisatie'; end if;
  if public.has_role(p_project, '{projectleider,werkvoorbereider,uitvoerder}') then
    null; -- eigen projectleiding mag iedereen uitnodigen
  elsif public.has_role(p_project, '{oa_werkvoorbereider}')
        and p_org = (public.my_membership(p_project)).organisation_id
        and p_role in ('oa_uitvoerder', 'oa_voorman', 'oa_werkvoorbereider') then
    null; -- werkvoorbereider OA nodigt eigen mensen uit
  else
    raise exception 'Geen recht om deelnemers uit te nodigen';
  end if;
  if v_kind = 'eigen' and p_role::text like 'oa_%' then raise exception 'OA-rol hoort bij een onderaannemer'; end if;
  if v_kind <> 'eigen' and p_role::text not like 'oa_%' then raise exception 'Kies een OA-rol voor een onderaannemer'; end if;

  insert into public.invites (project_id, phone, full_name, role, organisation_id)
    values (p_project, v_phone, p_name, p_role, p_org)
    on conflict (project_id, phone) do update
      set full_name = excluded.full_name, role = excluded.role, organisation_id = excluded.organisation_id,
          accepted_at = null
    returning id into v_id;

  -- Kanaal per onderaannemer
  if v_kind = 'onderaannemer' and not exists (
      select 1 from public.channels where project_id = p_project and kind = 'oa' and organisation_id = p_org) then
    insert into public.channels (project_id, name, kind, organisation_id)
      values (p_project, 'OA ' || v_org_name, 'oa', p_org);
  end if;

  update public.access_requests set status = 'goedgekeurd'
    where phone = v_phone and status = 'open'
      and project_code = (select code from public.projects where id = p_project);

  -- Bestaat het nummer al? Dan direct toevoegen.
  select id into v_user from public.profiles where phone = v_phone;
  if v_user is not null then
    insert into public.project_members (project_id, user_id, role, organisation_id)
      values (p_project, v_user, p_role, p_org)
      on conflict (project_id, user_id) do update set role = excluded.role, organisation_id = excluded.organisation_id, active = true;
    update public.profiles set organisation_id = coalesce(organisation_id, p_org),
                               full_name = case when full_name = '' then p_name else full_name end
      where id = v_user;
    update public.invites set accepted_at = now() where id = v_id;
  end if;
  return v_id;
end $$;

-- Na inloggen: openstaande uitnodigingen voor dit nummer verwerken
create or replace function public.claim_invites()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_phone text;
  r record;
  n integer := 0;
begin
  select phone into v_phone from public.profiles where id = auth.uid();
  if v_phone is null or v_phone = '' then return 0; end if;
  for r in select * from public.invites where phone = v_phone and accepted_at is null loop
    insert into public.project_members (project_id, user_id, role, organisation_id)
      values (r.project_id, auth.uid(), r.role, r.organisation_id)
      on conflict (project_id, user_id) do update set role = excluded.role, organisation_id = excluded.organisation_id, active = true;
    update public.profiles
      set organisation_id = coalesce(organisation_id, r.organisation_id),
          full_name = case when full_name = '' then r.full_name else full_name end
      where id = auth.uid();
    update public.invites set accepted_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Toegang aanvragen door een (nog) onbekend nummer
create or replace function public.request_access(p_code text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  select * into v from public.profiles where id = auth.uid();
  if v.id is null then raise exception 'Niet ingelogd'; end if;
  if exists (select 1 from public.access_requests
             where user_id = v.id and project_code = upper(trim(p_code)) and status = 'open') then
    return;
  end if;
  insert into public.access_requests (user_id, phone, full_name, project_code, note)
    values (v.id, v.phone, v.full_name, upper(trim(p_code)), p_note);
end $$;

create or replace function public.decline_access_request(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.access_requests r join public.projects p on p.code = r.project_code
                 where r.id = p_id and public.has_role(p.id, '{projectleider,werkvoorbereider}')) then
    raise exception 'Geen recht';
  end if;
  update public.access_requests set status = 'geweigerd' where id = p_id;
end $$;

create or replace function public.set_member_active(p_project uuid, p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(p_project, '{projectleider,werkvoorbereider}') then
    raise exception 'Geen recht om deelnemers te beheren';
  end if;
  update public.project_members set active = p_active where project_id = p_project and user_id = p_user;
end $$;

-- ---------------------------------------------------------------- meldingen

create or replace function public._item_for_update(p_item uuid)
returns public.items language plpgsql security definer set search_path = public as $$
declare v public.items;
begin
  select * into v from public.items where id = p_item for update;
  if v.id is null or not public.can_see_item(v) then raise exception 'Melding niet gevonden'; end if;
  return v;
end $$;

create or replace function public._is_reviewer(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(p_project, '{projectleider,werkvoorbereider,uitvoerder,werkverantwoordelijke}')
$$;

create or replace function public.item_set_status(p_item uuid, p_status text, p_note text default null)
returns public.items language plpgsql security definer set search_path = public as $$
declare
  v public.items;
  v_allowed text[];
  v_closed boolean;
  v_old text;
  ok boolean := false;
begin
  v := public._item_for_update(p_item);
  if v.status = 'ingetrokken' then raise exception 'Melding is ingetrokken'; end if;
  select allowed into v_allowed from public.item_transitions
    where type = v.type and from_status = v.status and to_status = p_status;
  if v_allowed is null then raise exception 'Statuswijziging % → % niet toegestaan', v.status, p_status; end if;
  ok := 'iedereen' = any (v_allowed)
     or ('eigenaar' = any (v_allowed) and v.owner_id = auth.uid())
     or ('melder' = any (v_allowed) and v.created_by = auth.uid())
     or ('beoordelaar' = any (v_allowed) and public._is_reviewer(v.project_id));
  if not ok then raise exception 'Geen recht voor deze statuswijziging'; end if;
  if v.type = 'afwijking' and p_status = 'geverifieerd' and v.owner_id = auth.uid() then
    raise exception 'Verificatie moet door een ander dan de hersteller';
  end if;
  if (v.type = 'gereedmelding' and p_status in ('afgekeurd', 'aanvulling_gevraagd')
      or v.type = 'afwijking' and p_status = 'maatregel' and v.status = 'hersteld')
     and coalesce(trim(p_note), '') = '' then
    raise exception 'Geef een reden op';
  end if;
  select closed into v_closed from public.item_statuses where type = v.type and status = p_status;
  v_old := v.status;
  update public.items set status = p_status, updated_at = now(),
         closed_at = case when v_closed then now() else null end
    where id = p_item returning * into v;
  insert into public.item_events (item_id, actor_id, kind, from_value, to_value, note)
    values (p_item, auth.uid(), 'status', v_old, p_status, p_note);
  return v;
end $$;

create or replace function public.item_set_due(p_item uuid, p_due timestamptz, p_reason text)
returns public.items language plpgsql security definer set search_path = public as $$
declare v public.items; v_old timestamptz;
begin
  v := public._item_for_update(p_item);
  if v.closed_at is not null then raise exception 'Melding is gesloten'; end if;
  if not (public._is_reviewer(v.project_id) or v.created_by = auth.uid()
          or public.has_role(v.project_id, '{oa_werkvoorbereider,oa_uitvoerder}')
             and v.owner_org_id = (public.my_membership(v.project_id)).organisation_id) then
    raise exception 'Geen recht om de termijn te wijzigen';
  end if;
  if v.due_at is not null and coalesce(trim(p_reason), '') = '' then
    raise exception 'Reden voor termijnwijziging is verplicht';
  end if;
  v_old := v.due_at;
  update public.items set due_at = p_due, updated_at = now(),
         original_due_at = coalesce(original_due_at, p_due)
    where id = p_item returning * into v;
  delete from public.notification_log where key like 'item:' || p_item || ':%';
  insert into public.item_events (item_id, actor_id, kind, from_value, to_value, note)
    values (p_item, auth.uid(), 'termijn', v_old::text, p_due::text, p_reason);
  return v;
end $$;

create or replace function public.item_set_owner(p_item uuid, p_owner uuid)
returns public.items language plpgsql security definer set search_path = public as $$
declare v public.items; v_old uuid; v_org uuid;
begin
  v := public._item_for_update(p_item);
  if v.closed_at is not null then raise exception 'Melding is gesloten'; end if;
  if p_owner is not null then
    select organisation_id into v_org from public.project_members
      where project_id = v.project_id and user_id = p_owner and active;
    if not found then raise exception 'Eigenaar is geen lid van dit project'; end if;
  end if;
  -- Intern: beoordelaars, logistiek en melder. OA: alleen binnen de eigen organisatie.
  if not (public._is_reviewer(v.project_id) or public.has_role(v.project_id, '{logistiek}')
          or v.created_by = auth.uid()
          or (public.has_role(v.project_id, '{oa_werkvoorbereider,oa_uitvoerder,oa_voorman}')
              and v_org = (public.my_membership(v.project_id)).organisation_id)) then
    raise exception 'Geen recht om toe te wijzen';
  end if;
  v_old := v.owner_id;
  update public.items set owner_id = p_owner, owner_org_id = v_org, updated_at = now()
    where id = p_item returning * into v;
  delete from public.notification_log where key like 'item:' || p_item || ':%';
  insert into public.item_events (item_id, actor_id, kind, from_value, to_value)
    values (p_item, auth.uid(), 'eigenaar', v_old::text, p_owner::text);
  return v;
end $$;

create or replace function public.item_update_fields(
  p_item uuid, p_title text, p_description text, p_location_label text, p_severity public.severity, p_labels text[])
returns public.items language plpgsql security definer set search_path = public as $$
declare v public.items; changes text := '';
begin
  v := public._item_for_update(p_item);
  if not (public._is_reviewer(v.project_id) or v.created_by = auth.uid()) then
    raise exception 'Alleen de melder of projectleiding kan velden wijzigen';
  end if;
  if p_title is distinct from v.title then changes := changes || 'titel; '; end if;
  if p_description is distinct from v.description then changes := changes || 'omschrijving; '; end if;
  if p_location_label is distinct from v.location_label then changes := changes || 'locatie; '; end if;
  if p_severity is distinct from v.severity then changes := changes || 'ernst ' || v.severity || '→' || p_severity || '; '; end if;
  if p_labels is distinct from v.labels then changes := changes || 'labels; '; end if;
  if changes = '' then return v; end if;
  update public.items set title = p_title, description = p_description, location_label = p_location_label,
         severity = p_severity, labels = coalesce(p_labels, '{}'), updated_at = now()
    where id = p_item returning * into v;
  insert into public.item_events (item_id, actor_id, kind, note)
    values (p_item, auth.uid(), 'veld', rtrim(changes, '; '));
  return v;
end $$;

create or replace function public.item_comment(p_item uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.items;
begin
  v := public._item_for_update(p_item);
  if coalesce(trim(p_body), '') = '' then raise exception 'Lege opmerking'; end if;
  update public.items set updated_at = now() where id = p_item;
  insert into public.item_events (item_id, actor_id, kind, note) values (p_item, auth.uid(), 'opmerking', p_body);
end $$;

-- Intrekken i.p.v. verwijderen (FO §6)
create or replace function public.item_withdraw(p_item uuid, p_reason text)
returns public.items language plpgsql security definer set search_path = public as $$
declare v public.items; v_old text;
begin
  v := public._item_for_update(p_item);
  if not (v.created_by = auth.uid() or public._is_reviewer(v.project_id)) then
    raise exception 'Alleen de melder of projectleiding kan intrekken';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Reden is verplicht'; end if;
  v_old := v.status;
  update public.items set status = 'ingetrokken', withdrawn_reason = p_reason, closed_at = now(), updated_at = now()
    where id = p_item returning * into v;
  insert into public.item_events (item_id, actor_id, kind, from_value, to_value, note)
    values (p_item, auth.uid(), 'ingetrokken', v_old, 'ingetrokken', p_reason);
  return v;
end $$;

-- Bericht intrekken: zichtbaar "ingetrokken", origineel in audit
create or replace function public.message_retract(p_message uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_message for update;
  if m.id is null or m.sender_id <> auth.uid() then raise exception 'Alleen de afzender kan intrekken'; end if;
  if m.retracted_at is not null then return; end if;
  insert into public.message_audit (message_id, original_body, original_transcript, retracted_by)
    values (m.id, m.body, m.transcript, auth.uid());
  update public.messages set retracted_at = now(), body = null, transcript = null where id = p_message;
end $$;

-- Overleg afronden (voorzitter of projectleiding); aanwezigen vastleggen
create or replace function public.meeting_close(p_meeting uuid, p_attendees jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare m public.meetings;
begin
  select * into m from public.meetings where id = p_meeting for update;
  if m.id is null or not public.is_member(m.project_id) then raise exception 'Overleg niet gevonden'; end if;
  if not (m.chair_id = auth.uid() or public._is_reviewer(m.project_id)) then
    raise exception 'Alleen de voorzitter of projectleiding kan het overleg afronden';
  end if;
  update public.meetings set closed_at = coalesce(closed_at, now()), attendees = coalesce(p_attendees, attendees)
    where id = p_meeting;
end $$;

-- Eigen pushtoken registreren
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language sql security definer set search_path = public as $$
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform, updated_at = now();
$$;

-- Alleen ingelogde gebruikers mogen deze functies aanroepen
revoke execute on function public.bootstrap_organisation, public.create_organisation, public.create_project,
  public.invite_member, public.claim_invites, public.set_member_active, public.item_set_status,
  public.item_set_due, public.item_set_owner, public.item_update_fields, public.item_comment,
  public.item_withdraw, public.message_retract, public.register_push_token,
  public.request_access, public.decline_access_request, public.meeting_close from anon, public;
grant execute on function public.bootstrap_organisation, public.create_organisation, public.create_project,
  public.invite_member, public.claim_invites, public.set_member_active, public.item_set_status,
  public.item_set_due, public.item_set_owner, public.item_update_fields, public.item_comment,
  public.item_withdraw, public.message_retract, public.register_push_token,
  public.request_access, public.decline_access_request, public.meeting_close to authenticated;
revoke execute on function public._item_for_update from anon, public, authenticated;
