-- Scenariotest voor rechten, nummerherkenning, statusmodel en audit trail.
-- Draaien: supabase/tests/run.sh (gebruikt een lokale PostgreSQL 15+).
\set ON_ERROR_STOP on

create or replace function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'Verwachtte fout (%), maar statement slaagde: %', p_like, p_sql;
exception when others then
  if sqlerrm like 'Verwachtte fout%' then raise; end if;
  if sqlerrm not ilike '%' || p_like || '%' then
    raise exception 'Verkeerde fout bij %: % (verwacht: %)', p_sql, sqlerrm, p_like;
  end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

-- Accounts (zoals Supabase Auth ze na sms-verificatie aanmaakt)
insert into auth.users (id, phone, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', '31611111111', '{"full_name":"Petra Leider"}'),
  ('00000000-0000-0000-0000-0000000000a2', '31622222222', '{}'),
  ('00000000-0000-0000-0000-0000000000a4', '31644444444', '{}');

do $$ begin
  assert (select phone from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') = '31611111111',
    'profiel krijgt geverifieerd nummer';
end $$;

-- ===== Projectleider richt organisatie en project in
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.bootstrap_organisation('Eigen Bouw BV');
select pg_temp.expect_error($q$ select public.bootstrap_organisation('Nog een') $q$, 'al ingericht');
select public.create_project('prj1', 'Kabeltracé Noord', 'Netbeheerder', 'Noord', 'projectleider') as project_id \gset
select public.create_organisation('De Vries Infra', 'onderaannemer') as oa_org \gset
select id as own_org from public.organisations where kind = 'eigen' \gset
select public.invite_member(:'project_id', '06-22222222', 'Mark Monteur', 'monteur', :'own_org');
select public.invite_member(:'project_id', '+31 6 3333 3333', 'Vincent Voorman', 'oa_voorman', :'oa_org');
select pg_temp.expect_error(
  format($q$ select public.invite_member(%L, '0655555555', 'X', 'monteur', %L) $q$, :'project_id', :'oa_org'),
  'OA-rol');
select pg_temp.expect_error($q$ update public.profiles set phone = '31699999999' where id = auth.uid() $q$,
  'kunnen niet zelf');

do $$ begin
  assert (select count(*) from public.channels) = 3, 'Algemeen, Intern team en OA-kanaal';
  assert (select code from public.projects) = 'PRJ1';
end $$;

-- ===== Monteur had al een account: direct toegevoegd op nummer
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  assert public.claim_invites() = 0, 'al gekoppeld bij uitnodigen';
  assert (select count(*) from public.projects) = 1;
  assert (select full_name from public.profiles where id = auth.uid()) = 'Mark Monteur';
  assert (select count(*) from public.channels) = 3, 'intern ziet alle kanalen';
end $$;

-- ===== Voorman OA registreert zich pas na de uitnodiging (sms-verificatie)
reset role;
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-0000000000a3', '31633333333');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  assert (select count(*) from public.projects) = 0, 'nog geen toegang voor claim';
  assert public.claim_invites() = 1, 'uitnodiging herkend op nummer';
  assert (select full_name from public.profiles where id = auth.uid()) = 'Vincent Voorman';
  assert (select count(*) from public.channels) = 2, 'OA ziet Algemeen en eigen OA-kanaal, niet Intern';
  assert not exists (select 1 from public.channels where kind = 'intern');
end $$;

-- ===== Monteur meldt afwijking toegewezen aan voorman OA
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
insert into public.items (id, project_id, type, title, severity, owner_id, due_at, lat, lng, captured_at)
values ('10000000-0000-0000-0000-000000000001', :'project_id', 'afwijking', 'Dekking te gering bij mofput 12',
        'hoog', '00000000-0000-0000-0000-0000000000a3', now() + interval '2 days', 52.1, 5.1, now());
do $$
declare i public.items;
begin
  select * into i from public.items where id = '10000000-0000-0000-0000-000000000001';
  assert i.number = 'PRJ1-X-001', 'nummer ' || i.number;
  assert i.status = 'gemeld';
  assert i.created_by = auth.uid();
  assert i.owner_org_id = (select id from public.organisations where name = 'De Vries Infra');
  assert (select count(*) from public.item_events where item_id = i.id and kind = 'aangemaakt') = 1;
end $$;
select pg_temp.expect_error(
  $q$ update public.items set title = 'stiekem' where id = '10000000-0000-0000-0000-000000000001' $q$,
  'permission denied');
select pg_temp.expect_error(
  $q$ delete from public.items where id = '10000000-0000-0000-0000-000000000001' $q$, 'permission denied');

-- ===== Projectleider maakt interne en project-acties
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.items (id, project_id, type, title, visibility)
values ('10000000-0000-0000-0000-000000000002', :'project_id', 'actie', 'Interne kostenafweging', 'intern');
insert into public.items (id, project_id, type, title, owner_id)
values ('10000000-0000-0000-0000-000000000003', :'project_id', 'actie', 'Materiaal bestellen',
        '00000000-0000-0000-0000-0000000000a2');
do $$ begin
  assert (select count(*) from public.items) = 3, 'projectleider ziet alles';
  assert (select number from public.items where id = '10000000-0000-0000-0000-000000000003') = 'PRJ1-A-003';
end $$;

-- ===== Zichtbaarheid voor OA
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  assert (select count(*) from public.items) = 1, 'OA ziet alleen aan hem toegewezen melding';
end $$;

-- ===== Statusmodel afwijking
select pg_temp.expect_error(
  $q$ select public.item_set_status('10000000-0000-0000-0000-000000000001', 'beoordeeld') $q$, 'Geen recht');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.item_set_status('10000000-0000-0000-0000-000000000001', 'beoordeeld', 'Beschermkoker toepassen');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select public.item_set_status('10000000-0000-0000-0000-000000000001', 'maatregel');
select public.item_set_status('10000000-0000-0000-0000-000000000001', 'hersteld', 'Koker geplaatst');
select pg_temp.expect_error(
  $q$ select public.item_set_status('10000000-0000-0000-0000-000000000001', 'gesloten') $q$, 'niet toegestaan');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect_error(
  $q$ select public.item_set_status('10000000-0000-0000-0000-000000000001', 'maatregel') $q$, 'reden');
select public.item_set_status('10000000-0000-0000-0000-000000000001', 'geverifieerd');
select public.item_set_status('10000000-0000-0000-0000-000000000001', 'gesloten');
do $$ begin
  assert (select closed_at is not null from public.items where id = '10000000-0000-0000-0000-000000000001');
  assert (select string_agg(coalesce(from_value, '-') || '>' || to_value, ',' order by id) from public.item_events
          where item_id = '10000000-0000-0000-0000-000000000001')
         = '->gemeld,gemeld>beoordeeld,beoordeeld>maatregel,maatregel>hersteld,hersteld>geverifieerd,geverifieerd>gesloten';
end $$;

-- ===== Termijn, eigenaar, opmerking, intrekken
select public.item_set_due('10000000-0000-0000-0000-000000000003', now() + interval '3 days', null);
select pg_temp.expect_error(
  $q$ select public.item_set_due('10000000-0000-0000-0000-000000000003', now() + interval '5 days', '') $q$,
  'verplicht');
select public.item_set_due('10000000-0000-0000-0000-000000000003', now() + interval '5 days', 'Levering vertraagd');
select public.item_comment('10000000-0000-0000-0000-000000000003', 'Leverancier gebeld');
select pg_temp.expect_error(
  $q$ select public.item_set_owner('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a4') $q$,
  'geen lid');
select public.item_withdraw('10000000-0000-0000-0000-000000000002', 'Dubbel ingevoerd');
do $$
declare i public.items;
begin
  select * into i from public.items where id = '10000000-0000-0000-0000-000000000003';
  assert i.original_due_at < i.due_at, 'oorspronkelijke termijn blijft bewaard';
  assert (select count(*) from public.item_events where item_id = i.id) = 4;
  assert (select status from public.items where id = '10000000-0000-0000-0000-000000000002') = 'ingetrokken';
end $$;

-- ===== Monteur meldt actie gereed, melder accepteert
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select public.item_set_status('10000000-0000-0000-0000-000000000003', 'gereed_gemeld');
select pg_temp.expect_error(
  $q$ select public.item_set_status('10000000-0000-0000-0000-000000000003', 'afgerond') $q$, 'Geen recht');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.item_set_status('10000000-0000-0000-0000-000000000003', 'afgerond');

-- ===== Berichten
select id as intern_channel from public.channels where kind = 'intern' \gset
select id as algemeen_channel from public.channels where kind = 'algemeen' \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select pg_temp.expect_error(format(
  $q$ insert into public.messages (id, channel_id, kind, body) values (gen_random_uuid(), %L, 'tekst', 'hoi') $q$,
  :'intern_channel'), 'row-level security');
insert into public.messages (id, channel_id, kind, body)
values ('20000000-0000-0000-0000-000000000001', :'algemeen_channel', 'tekst', 'Bord omgereden bij kruising');
select public.message_retract('20000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select body is null and retracted_at is not null from public.messages
          where id = '20000000-0000-0000-0000-000000000001');
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select original_body from public.message_audit) = 'Bord omgereden bij kruising',
    'projectleider ziet origineel in audit';
end $$;

-- ===== Opslag: alleen projectleden
insert into storage.objects (bucket_id, name) values ('media', :'project_id' || '/foto1.jpg');

-- ===== Onbekend nummer ziet niets
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
do $$ begin
  assert public.claim_invites() = 0;
  assert (select count(*) from public.projects) = 0;
  assert (select count(*) from public.items) = 0;
  assert (select count(*) from public.messages) = 0;
  assert (select count(*) from storage.objects) = 0;
  assert (select count(*) from public.profiles) = 1, 'alleen eigen profiel';
end $$;
select pg_temp.expect_error(format(
  $q$ insert into storage.objects (bucket_id, name) values ('media', %L) $q$, :'project_id' || '/x.jpg'),
  'row-level security');

-- ===== Onbekend nummer vraagt toegang; projectleider ziet de aanvraag en nodigt uit
update public.profiles set full_name = 'Nieuwe Monteur' where id = auth.uid();
select public.request_access('prj1', 'nieuwe monteur ploeg 2');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select phone from public.access_requests where status = 'open') = '31644444444';
end $$;
select public.invite_member(:'project_id', '0644444444', 'Nieuwe Monteur', 'monteur', :'own_org');
do $$ begin
  assert (select status from public.access_requests) = 'goedgekeurd';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
do $$ begin
  assert (select count(*) from public.projects) = 1, 'na uitnodiging direct toegang';
end $$;

-- ===== Overleg afronden
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.meetings (id, project_id, title) values ('30000000-0000-0000-0000-000000000001', :'project_id', 'Bouwoverleg 43');
select public.meeting_close('30000000-0000-0000-0000-000000000001', '[{"user_id":"00000000-0000-0000-0000-0000000000a1","present":true}]');
do $$ begin
  assert (select closed_at is not null from public.meetings);
end $$;

reset role;
do $$ begin
  assert (select count(*) from net.calls where body ->> 'kind' = 'item_created') = 3, 'notify bij nieuwe meldingen';
  assert (select count(*) from net.calls where body ->> 'kind' = 'item_status') = 8, 'notify bij statuswijziging';
  assert (select count(*) from net.calls where body ->> 'kind' = 'message') = 1;
  assert exists (select 1 from cron.job where jobname = 'projectmelder-reminders');
end $$;
select 'Alle scenario''s geslaagd' as resultaat;
