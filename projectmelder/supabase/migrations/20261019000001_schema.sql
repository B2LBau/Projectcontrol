-- ProjectMelder – databaseschema (FO hoofdstuk 9)
-- Uitgangspunten:
--  * Nummerherkenning: profiel gekoppeld aan geverifieerd telefoonnummer (auth.users.phone).
--  * Audit trail: meldingen worden alleen via functies gewijzigd; elke wijziging komt in item_events.
--  * Niets wordt verwijderd: berichten en meldingen worden ingetrokken, niet gewist.
--  * Onderaannemers zien alleen meldingen van de eigen organisatie of die aan hen zijn toegewezen.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- typen

create type public.member_role as enum (
  'projectleider', 'werkvoorbereider', 'uitvoerder', 'logistiek', 'monteur', 'werkverantwoordelijke',
  'oa_werkvoorbereider', 'oa_uitvoerder', 'oa_voorman'
);
create type public.item_type as enum (
  'actie', 'besluit', 'constatering', 'controleronde', 'verkeersmaatregel', 'gereedmelding', 'afwijking', 'vraag'
);
create type public.severity as enum ('laag', 'normaal', 'hoog', 'kritiek');

-- ---------------------------------------------------------------- hulpfuncties

create or replace function public.normalize_phone(p text) returns text
language sql immutable as $$
  select case
    when p is null then null
    when regexp_replace(p, '[^0-9+]', '', 'g') like '+%' then regexp_replace(p, '\D', '', 'g')
    when regexp_replace(p, '\D', '', 'g') like '00%' then substr(regexp_replace(p, '\D', '', 'g'), 3)
    when regexp_replace(p, '\D', '', 'g') like '0%' then '31' || substr(regexp_replace(p, '\D', '', 'g'), 2)
    else regexp_replace(p, '\D', '', 'g')
  end
$$;

-- ---------------------------------------------------------------- tabellen

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('eigen', 'onderaannemer', 'opdrachtgever')),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text not null unique,
  full_name text not null default '',
  job_title text,
  organisation_id uuid references public.organisations (id),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  client text,
  location text,
  item_seq integer not null default 0,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  organisation_id uuid references public.organisations (id),
  active boolean not null default true,
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  phone text not null,
  full_name text not null,
  role public.member_role not null,
  organisation_id uuid references public.organisations (id),
  invited_by uuid references public.profiles (id) default auth.uid(),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, phone)
);

-- Aanvragen van onbekende nummers (FO: beheerder keurt goed of af)
create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  phone text not null,
  full_name text not null,
  project_code text not null,
  note text,
  status text not null default 'open' check (status in ('open', 'goedgekeurd', 'geweigerd')),
  created_at timestamptz not null default now()
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('algemeen', 'intern', 'oa', 'werkpakket', 'direct')),
  organisation_id uuid references public.organisations (id),
  created_at timestamptz not null default now()
);

create table public.channel_members (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (channel_id, user_id)
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  kind text not null default 'bouwoverleg',
  starts_at timestamptz not null default now(),
  location text,
  chair_id uuid references public.profiles (id) default auth.uid(),
  attendees jsonb not null default '[]',
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  seq integer not null default 0,
  number text not null default '',
  type public.item_type not null,
  title text not null check (length(title) between 1 and 300),
  description text,
  transcript text,
  status text not null default '',
  severity public.severity not null default 'normaal',
  owner_id uuid references public.profiles (id),
  owner_org_id uuid references public.organisations (id),
  due_at timestamptz,
  original_due_at timestamptz,
  location_label text,
  lat double precision,
  lng double precision,
  accuracy double precision,
  captured_at timestamptz,
  created_by uuid not null references public.profiles (id) default auth.uid(),
  creator_org_id uuid references public.organisations (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  visibility text not null default 'project' check (visibility in ('project', 'intern')),
  labels text[] not null default '{}',
  meeting_id uuid references public.meetings (id),
  source_message_id uuid,
  parent_item_id uuid references public.items (id),
  details jsonb not null default '{}',
  ai_fields text[] not null default '{}',
  withdrawn_reason text
);
create index items_project_idx on public.items (project_id, created_at desc);
create index items_owner_idx on public.items (owner_id) where closed_at is null;
create index items_due_idx on public.items (due_at) where closed_at is null;

create table public.item_events (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.items (id),
  actor_id uuid references public.profiles (id),
  at timestamptz not null default now(),
  kind text not null check (kind in ('aangemaakt', 'status', 'termijn', 'eigenaar', 'veld', 'opmerking', 'ingetrokken')),
  from_value text,
  to_value text,
  note text
);
create index item_events_item_idx on public.item_events (item_id, at);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id),
  sender_id uuid not null references public.profiles (id) default auth.uid(),
  kind text not null check (kind in ('tekst', 'foto', 'spraak', 'video', 'document', 'melding', 'systeem')),
  body text,
  transcript text,
  item_id uuid references public.items (id),
  retracted_at timestamptz,
  created_at timestamptz not null default now(),
  captured_at timestamptz,
  lat double precision,
  lng double precision,
  accuracy double precision
);
create index messages_channel_idx on public.messages (channel_id, created_at desc);

-- Originele inhoud van ingetrokken berichten (alleen voor de audit trail)
create table public.message_audit (
  message_id uuid primary key references public.messages (id),
  original_body text,
  original_transcript text,
  retracted_by uuid references public.profiles (id),
  retracted_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  item_id uuid references public.items (id),
  message_id uuid references public.messages (id),
  kind text not null check (kind in ('foto', 'video', 'spraak', 'document')),
  storage_path text not null,
  mime text not null,
  created_by uuid not null references public.profiles (id) default auth.uid(),
  captured_at timestamptz,
  capture_end_at timestamptz,
  uploaded_at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  accuracy double precision,
  heading double precision,
  end_lat double precision,
  end_lng double precision,
  source text not null default 'camera' check (source in ('camera', 'galerij', 'microfoon')),
  duration_ms integer
);
create index attachments_item_idx on public.attachments (item_id);
create index attachments_message_idx on public.attachments (message_id);

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);

create table public.notification_log (
  key text primary key,
  sent_at timestamptz not null default now()
);

-- Statusmodel (gelijk aan src/domain/status.ts)
create table public.item_transitions (
  type public.item_type not null,
  from_status text not null,
  to_status text not null,
  allowed text[] not null, -- iedereen | eigenaar | melder | beoordelaar
  primary key (type, from_status, to_status)
);
create table public.item_statuses (
  type public.item_type not null,
  status text not null,
  position integer not null,
  closed boolean not null default false,
  primary key (type, status)
);

insert into public.item_statuses (type, status, position, closed) values
  ('actie','nieuw',0,false),('actie','opgepakt',1,false),('actie','gereed_gemeld',2,false),('actie','afgerond',3,true),
  ('besluit','concept',0,false),('besluit','vastgesteld',1,true),('besluit','herzien',2,true),('besluit','vervallen',3,true),
  ('constatering','gemeld',0,false),('constatering','in_behandeling',1,false),('constatering','afgehandeld',2,true),
  ('controleronde','gepland',0,false),('controleronde','bezig',1,false),('controleronde','afgerond',2,true),('controleronde','overgeslagen',3,true),
  ('verkeersmaatregel','aangevraagd',0,false),('verkeersmaatregel','geplaatst',1,false),('verkeersmaatregel','actief',2,false),('verkeersmaatregel','verwijderd',3,false),('verkeersmaatregel','gesloten',4,true),
  ('gereedmelding','ingediend',0,false),('gereedmelding','in_beoordeling',1,false),('gereedmelding','aanvulling_gevraagd',2,false),('gereedmelding','geaccepteerd',3,true),('gereedmelding','afgekeurd',4,true),
  ('afwijking','gemeld',0,false),('afwijking','beoordeeld',1,false),('afwijking','maatregel',2,false),('afwijking','hersteld',3,false),('afwijking','geverifieerd',4,false),('afwijking','gesloten',5,true),
  ('vraag','open',0,false),('vraag','beantwoord',1,false),('vraag','gesloten',2,true);

insert into public.item_transitions (type, from_status, to_status, allowed) values
  ('actie','nieuw','opgepakt','{eigenaar,beoordelaar}'),
  ('actie','nieuw','gereed_gemeld','{eigenaar}'),
  ('actie','opgepakt','gereed_gemeld','{eigenaar}'),
  ('actie','gereed_gemeld','afgerond','{melder,beoordelaar}'),
  ('actie','gereed_gemeld','opgepakt','{melder,beoordelaar}'),
  ('actie','afgerond','opgepakt','{melder,beoordelaar}'),
  ('besluit','concept','vastgesteld','{beoordelaar}'),
  ('besluit','vastgesteld','herzien','{beoordelaar}'),
  ('besluit','vastgesteld','vervallen','{beoordelaar}'),
  ('constatering','gemeld','in_behandeling','{eigenaar,beoordelaar}'),
  ('constatering','gemeld','afgehandeld','{beoordelaar}'),
  ('constatering','in_behandeling','afgehandeld','{beoordelaar}'),
  ('controleronde','gepland','bezig','{iedereen}'),
  ('controleronde','bezig','afgerond','{eigenaar,melder,beoordelaar}'),
  ('controleronde','gepland','overgeslagen','{beoordelaar}'),
  ('verkeersmaatregel','aangevraagd','geplaatst','{eigenaar,beoordelaar}'),
  ('verkeersmaatregel','geplaatst','actief','{eigenaar,beoordelaar}'),
  ('verkeersmaatregel','actief','verwijderd','{eigenaar,beoordelaar}'),
  ('verkeersmaatregel','verwijderd','gesloten','{beoordelaar}'),
  ('gereedmelding','ingediend','in_beoordeling','{beoordelaar}'),
  ('gereedmelding','ingediend','geaccepteerd','{beoordelaar}'),
  ('gereedmelding','in_beoordeling','geaccepteerd','{beoordelaar}'),
  ('gereedmelding','in_beoordeling','afgekeurd','{beoordelaar}'),
  ('gereedmelding','in_beoordeling','aanvulling_gevraagd','{beoordelaar}'),
  ('gereedmelding','aanvulling_gevraagd','ingediend','{melder,eigenaar}'),
  ('afwijking','gemeld','beoordeeld','{beoordelaar}'),
  ('afwijking','beoordeeld','maatregel','{eigenaar,beoordelaar}'),
  ('afwijking','maatregel','hersteld','{eigenaar}'),
  ('afwijking','hersteld','geverifieerd','{beoordelaar}'),
  ('afwijking','hersteld','maatregel','{beoordelaar}'),
  ('afwijking','geverifieerd','gesloten','{beoordelaar}'),
  ('vraag','open','beantwoord','{eigenaar,iedereen}'),
  ('vraag','beantwoord','gesloten','{melder,beoordelaar}'),
  ('vraag','beantwoord','open','{melder}');

-- ---------------------------------------------------------------- toegangsfuncties

create or replace function public.my_membership(p_project uuid)
returns public.project_members
language sql stable security definer set search_path = public as $$
  select * from public.project_members
  where project_id = p_project and user_id = auth.uid() and active
$$;

create or replace function public.is_member(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members
                 where project_id = p_project and user_id = auth.uid() and active)
$$;

create or replace function public.is_internal(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members m
    join public.organisations o on o.id = m.organisation_id
    where m.project_id = p_project and m.user_id = auth.uid() and m.active and o.kind = 'eigen')
$$;

create or replace function public.has_role(p_project uuid, p_roles public.member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members
                 where project_id = p_project and user_id = auth.uid() and active and role = any (p_roles))
$$;

create or replace function public.can_see_channel(p_channel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channels c
    where c.id = p_channel and public.is_member(c.project_id) and (
      c.kind = 'algemeen'
      or (c.kind = 'intern' and public.is_internal(c.project_id))
      or (c.kind = 'oa' and (public.is_internal(c.project_id)
                             or (public.my_membership(c.project_id)).organisation_id = c.organisation_id))
      or (c.kind in ('werkpakket', 'direct')
          and exists (select 1 from public.channel_members cm where cm.channel_id = c.id and cm.user_id = auth.uid()))
    ))
$$;

create or replace function public.can_see_item(i public.items) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member(i.project_id) and (
    public.is_internal(i.project_id)
    or (i.visibility = 'project' and (
          i.created_by = auth.uid()
          or i.owner_id = auth.uid()
          or i.creator_org_id = (public.my_membership(i.project_id)).organisation_id
          or i.owner_org_id = (public.my_membership(i.project_id)).organisation_id)))
$$;

create or replace function public.can_see_item_id(p_item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.can_see_item(i) from public.items i where i.id = p_item), false)
$$;

-- ---------------------------------------------------------------- triggers

-- Nieuw auth-account -> profiel met geverifieerd telefoonnummer (nummerherkenning)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, full_name)
  values (new.id, public.normalize_phone(coalesce(new.phone, '')), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Telefoonnummer volgt altijd auth (bijv. na nummerwijziging met verificatie)
create or replace function public.handle_user_phone_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phone is distinct from old.phone and new.phone is not null then
    update public.profiles set phone = public.normalize_phone(new.phone) where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_phone_changed after update of phone on auth.users
  for each row execute function public.handle_user_phone_change();

-- Gebruiker mag alleen naam en functie wijzigen
create or replace function public.protect_profile() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.phone is distinct from old.phone
       or new.organisation_id is distinct from old.organisation_id
       or new.is_admin is distinct from old.is_admin then
      raise exception 'Telefoonnummer, organisatie en beheerrechten kunnen niet zelf worden gewijzigd';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile();

-- Nummer, beginstatus en organisatie van de melder bij aanmaken
create or replace function public.items_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_seq integer;
  v_prefix text;
begin
  if not public.is_member(new.project_id) then
    raise exception 'Geen lid van dit project';
  end if;
  new.created_by := auth.uid();
  update public.projects set item_seq = item_seq + 1 where id = new.project_id
    returning item_seq, code into v_seq, v_code;
  v_prefix := case new.type
    when 'actie' then 'A' when 'besluit' then 'B' when 'constatering' then 'C' when 'controleronde' then 'R'
    when 'verkeersmaatregel' then 'V' when 'gereedmelding' then 'G' when 'afwijking' then 'X' else 'Q' end;
  new.seq := v_seq;
  new.number := v_code || '-' || v_prefix || '-' || lpad(v_seq::text, 3, '0');
  select status into new.status from public.item_statuses where type = new.type and position = 0;
  new.creator_org_id := (public.my_membership(new.project_id)).organisation_id;
  if new.owner_id is not null then
    if not exists (select 1 from public.project_members where project_id = new.project_id and user_id = new.owner_id and active) then
      raise exception 'Eigenaar is geen lid van dit project';
    end if;
    new.owner_org_id := (select organisation_id from public.project_members
                         where project_id = new.project_id and user_id = new.owner_id);
  end if;
  new.original_due_at := new.due_at;
  new.created_at := now();
  new.updated_at := now();
  new.closed_at := null;
  new.withdrawn_reason := null;
  return new;
end $$;

create trigger items_before_insert before insert on public.items
  for each row execute function public.items_before_insert();

create or replace function public.items_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.item_events (item_id, actor_id, kind, to_value)
  values (new.id, new.created_by, 'aangemaakt', new.status);
  return new;
end $$;

create trigger items_after_insert after insert on public.items
  for each row execute function public.items_after_insert();

-- ---------------------------------------------------------------- RLS

alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.invites enable row level security;
alter table public.access_requests enable row level security;
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.meetings enable row level security;
alter table public.items enable row level security;
alter table public.item_events enable row level security;
alter table public.messages enable row level security;
alter table public.message_audit enable row level security;
alter table public.attachments enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notification_log enable row level security;
alter table public.item_transitions enable row level security;
alter table public.item_statuses enable row level security;

create policy "organisaties zichtbaar voor ingelogden" on public.organisations
  for select to authenticated using (true);

create policy "eigen profiel of projectgenoot" on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or exists (select 1 from public.project_members a join public.project_members b on a.project_id = b.project_id
               where a.user_id = auth.uid() and a.active and b.user_id = profiles.id));
create policy "eigen profiel bijwerken" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "projecten van leden" on public.projects
  for select to authenticated using (public.is_member(id));

create policy "leden van eigen projecten" on public.project_members
  for select to authenticated using (public.is_member(project_id));

create policy "uitnodigingen voor beheerders" on public.invites
  for select to authenticated using (
    public.has_role(project_id, '{projectleider,werkvoorbereider,uitvoerder,oa_werkvoorbereider}'));

create policy "eigen toegangsaanvragen" on public.access_requests
  for select to authenticated using (user_id = auth.uid() or exists (
    select 1 from public.projects p where p.code = access_requests.project_code
    and public.has_role(p.id, '{projectleider,werkvoorbereider}')));

create policy "zichtbare kanalen" on public.channels
  for select to authenticated using (public.can_see_channel(id));
create policy "kanaalleden" on public.channel_members
  for select to authenticated using (public.can_see_channel(channel_id));

create policy "overleggen van project" on public.meetings
  for select to authenticated using (public.is_member(project_id));
create policy "overleg aanmaken" on public.meetings
  for insert to authenticated with check (public.is_member(project_id));

create policy "zichtbare meldingen" on public.items
  for select to authenticated using (public.can_see_item(items));
create policy "melding aanmaken" on public.items
  for insert to authenticated with check (public.is_member(project_id));
-- Geen update/delete-policy: wijzigingen lopen via functies met audit trail.

create policy "historie van zichtbare meldingen" on public.item_events
  for select to authenticated using (public.can_see_item_id(item_id));

create policy "berichten in zichtbare kanalen" on public.messages
  for select to authenticated using (public.can_see_channel(channel_id));
create policy "bericht plaatsen" on public.messages
  for insert to authenticated with check (sender_id = auth.uid() and public.can_see_channel(channel_id));

create policy "audit alleen projectleiding" on public.message_audit
  for select to authenticated using (exists (
    select 1 from public.messages m join public.channels c on c.id = m.channel_id
    where m.id = message_audit.message_id and public.has_role(c.project_id, '{projectleider,werkverantwoordelijke}')));

create policy "bijlagen van zichtbare berichten en meldingen" on public.attachments
  for select to authenticated using (
    public.is_member(project_id) and (
      (item_id is not null and public.can_see_item_id(item_id))
      or (message_id is not null and exists (select 1 from public.messages m where m.id = message_id and public.can_see_channel(m.channel_id)))
      or (item_id is null and message_id is null and created_by = auth.uid())));
create policy "bijlage toevoegen" on public.attachments
  for insert to authenticated with check (created_by = auth.uid() and public.is_member(project_id));

create policy "eigen pushtokens" on public.push_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "statusmodel leesbaar" on public.item_statuses for select to authenticated using (true);
create policy "overgangen leesbaar" on public.item_transitions for select to authenticated using (true);

-- Ingelogde gebruikers mogen niet direct items wijzigen of iets verwijderen.
revoke update, delete on public.items, public.item_events, public.messages, public.attachments from authenticated, anon;

-- ---------------------------------------------------------------- opslag (foto's, spraak)

insert into storage.buckets (id, name, public) values ('media', 'media', false)
  on conflict (id) do nothing;

-- Pad: <project_id>/<bestand>
create policy "media lezen als projectlid" on storage.objects
  for select to authenticated using (
    bucket_id = 'media' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "media uploaden als projectlid" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'media' and public.is_member(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------- realtime

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.items;
