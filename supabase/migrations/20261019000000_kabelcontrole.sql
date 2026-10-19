-- ProjectMelder: tabellen, beveiliging (RLS) en fotoopslag.
-- Uitvoeren in Supabase: SQL Editor → New query → dit hele bestand plakken → Run.
--
-- Toegangsmodel: iedere ingelogde gebruiker van deze Supabase-omgeving ziet en bewerkt alle projecten.
-- Zet daarom "Allow new users to sign up" UIT (Authentication → Sign In / Providers) en maak gebruikers
-- zelf aan via Authentication → Users → Add user.

-- Zet updated_at bij elke wijziging op het moment van de server; de app haalt hiermee wijzigingen op.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Projecten ------------------------------------------------------------------------------------------

create table if not exists public.projects (
  id text primary key,
  name text not null,
  number text not null default '',
  client text not null default '',
  location text not null default '',
  grid_operator text not null,
  param_overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  created_by uuid default auth.uid() references auth.users (id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Tracédelen -----------------------------------------------------------------------------------------

create table if not exists public.sections (
  id text primary key,
  project_id text not null references public.projects (id),
  name text not null,
  from_point text not null default '',
  to_point text not null default '',
  required_checks text[] not null default '{}',
  created_at timestamptz not null,
  release jsonb,
  release_log jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid() references auth.users (id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists sections_project_id_idx on public.sections (project_id);

-- Registraties ---------------------------------------------------------------------------------------

create table if not exists public.registrations (
  id text primary key,
  section_id text not null references public.sections (id),
  check_id text not null,
  input_values jsonb not null default '{}'::jsonb,
  params jsonb not null default '{}'::jsonb,
  evaluation jsonb not null,
  -- Paden in de opslagbucket "fotos", bijv. "<registratie-id>/<bestand>.jpg".
  photos text[] not null default '{}',
  location jsonb,
  recorded_by text not null,
  recorded_at timestamptz not null,
  remark text not null default '',
  withdrawn jsonb,
  created_by uuid default auth.uid() references auth.users (id),
  updated_at timestamptz not null default now()
);

create index if not exists registrations_section_id_idx on public.registrations (section_id);

-- Index voor het ophalen van wijzigingen sinds de vorige synchronisatie.
create index if not exists projects_updated_at_idx on public.projects (updated_at);
create index if not exists sections_updated_at_idx on public.sections (updated_at);
create index if not exists registrations_updated_at_idx on public.registrations (updated_at);

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before insert or update on public.projects
  for each row execute function public.touch_updated_at();
drop trigger if exists sections_touch on public.sections;
create trigger sections_touch before insert or update on public.sections
  for each row execute function public.touch_updated_at();
drop trigger if exists registrations_touch on public.registrations;
create trigger registrations_touch before insert or update on public.registrations
  for each row execute function public.touch_updated_at();

-- Bewijsregels afdwingen in de database ---------------------------------------------------------------

-- Een registratie is bewijs: de inhoud ligt vast. Alleen intrekken (met reden) is toegestaan, en een
-- intrekking kan niet ongedaan gemaakt worden.
create or replace function public.guard_registration_update() returns trigger
language plpgsql as $$
begin
  if (new.section_id, new.check_id, new.input_values, new.params, new.evaluation, new.photos, new.location,
      new.recorded_by, new.recorded_at, new.remark)
     is distinct from
     (old.section_id, old.check_id, old.input_values, old.params, old.evaluation, old.photos, old.location,
      old.recorded_by, old.recorded_at, old.remark) then
    raise exception 'Een registratie kan niet gewijzigd worden, alleen ingetrokken.';
  end if;
  if old.withdrawn is not null and new.withdrawn is distinct from old.withdrawn then
    raise exception 'Een intrekking kan niet ongedaan gemaakt worden.';
  end if;
  return new;
end;
$$;

drop trigger if exists registrations_guard on public.registrations;
create trigger registrations_guard before update on public.registrations
  for each row execute function public.guard_registration_update();

-- Een tracédeel of project met registraties kan niet verwijderd worden.
create or replace function public.guard_soft_delete() returns trigger
language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if tg_table_name = 'sections' and exists (
      select 1 from public.registrations r where r.section_id = new.id
    ) then
      raise exception 'Tracédeel heeft registraties en kan niet verwijderd worden.';
    end if;
    if tg_table_name = 'projects' and exists (
      select 1 from public.registrations r join public.sections s on s.id = r.section_id
      where s.project_id = new.id
    ) then
      raise exception 'Project heeft registraties en kan niet verwijderd worden.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_guard_delete on public.projects;
create trigger projects_guard_delete before update on public.projects
  for each row execute function public.guard_soft_delete();
drop trigger if exists sections_guard_delete on public.sections;
create trigger sections_guard_delete before update on public.sections
  for each row execute function public.guard_soft_delete();

-- Row Level Security ---------------------------------------------------------------------------------
-- Alleen ingelogde gebruikers; nooit echt verwijderen (de app markeert met deleted_at).

alter table public.projects enable row level security;
alter table public.sections enable row level security;
alter table public.registrations enable row level security;

drop policy if exists "lezen" on public.projects;
create policy "lezen" on public.projects for select to authenticated using (true);
drop policy if exists "toevoegen" on public.projects;
create policy "toevoegen" on public.projects for insert to authenticated with check (true);
drop policy if exists "wijzigen" on public.projects;
create policy "wijzigen" on public.projects for update to authenticated using (true) with check (true);

drop policy if exists "lezen" on public.sections;
create policy "lezen" on public.sections for select to authenticated using (true);
drop policy if exists "toevoegen" on public.sections;
create policy "toevoegen" on public.sections for insert to authenticated with check (true);
drop policy if exists "wijzigen" on public.sections;
create policy "wijzigen" on public.sections for update to authenticated using (true) with check (true);

drop policy if exists "lezen" on public.registrations;
create policy "lezen" on public.registrations for select to authenticated using (true);
drop policy if exists "toevoegen" on public.registrations;
create policy "toevoegen" on public.registrations for insert to authenticated with check (true);
drop policy if exists "wijzigen" on public.registrations;
create policy "wijzigen" on public.registrations for update to authenticated using (true) with check (true);

-- Foto's ---------------------------------------------------------------------------------------------
-- Privé bucket: alleen ingelogde gebruikers kunnen foto's toevoegen en bekijken, niet vervangen of wissen.

insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;

drop policy if exists "fotos lezen" on storage.objects;
create policy "fotos lezen" on storage.objects for select to authenticated using (bucket_id = 'fotos');
drop policy if exists "fotos toevoegen" on storage.objects;
create policy "fotos toevoegen" on storage.objects for insert to authenticated with check (bucket_id = 'fotos');
