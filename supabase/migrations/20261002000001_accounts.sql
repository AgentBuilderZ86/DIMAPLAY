-- M1 — Accounts: profiles, consents, onboarding completion, RLS.
-- Account deletion is handled by the `delete-account` Edge Function (auth.admin.deleteUser),
-- which cascades to every table below via ON DELETE CASCADE.

create type public.sport as enum ('foot', 'padel', 'tennis');
create type public.consent_kind as enum ('terms', 'privacy', 'image', 'parental');

-- Conservative minor rule: with only a birth YEAR we cannot know the exact age, so anyone who
-- could still be under 18 this year is treated as a minor (year difference <= 18).
create function public.is_minor_year(p_birth_year smallint)
returns boolean
language sql
stable
as $$
  select p_birth_year is not null
     and (extract(year from now())::int - p_birth_year) <= 18;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique check (handle ~ '^[a-z0-9_.]{3,20}$'),
  display_name text check (char_length(display_name) between 2 and 40),
  city text check (char_length(city) between 2 and 60),
  neighborhood text check (char_length(neighborhood) between 2 and 60),
  sports public.sport[] not null default '{}',
  birth_year smallint check (birth_year between 1930 and 2100),
  is_minor boolean not null default false,
  parental_consent_at timestamptz,
  recruiter_visible boolean not null default false,
  language text not null default 'fr' check (language in ('fr', 'ar', 'en')),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.consent_kind not null,
  version text not null check (char_length(version) between 1 and 32),
  granted boolean not null,
  -- reserved for per-match image rights (M2/M3)
  match_id uuid,
  created_at timestamptz not null default now()
);
create index consents_user_kind_idx on public.consents (user_id, kind, created_at desc);

-- ---------------------------------------------------------------- triggers

create function public.profiles_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.birth_year is not null
     and new.birth_year is distinct from old.birth_year then
    raise exception 'birth_year cannot be changed once set' using errcode = '42501';
  end if;
  new.is_minor := public.is_minor_year(new.birth_year);
  if new.is_minor then
    new.recruiter_visible := false;  -- minors never appear in the recruiter showcase
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_guard
before insert or update on public.profiles
for each row execute function public.profiles_guard();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- onboarding

-- Latest decision per consent kind for the caller.
create function public.has_consent(p_kind public.consent_kind)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select c.granted from public.consents c
      where c.user_id = auth.uid() and c.kind = p_kind and c.match_id is null
      order by c.created_at desc, c.id desc limit 1),
    false);
$$;

create function public.complete_onboarding()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if p.display_name is null or p.city is null or p.neighborhood is null
     or p.birth_year is null or coalesce(array_length(p.sports, 1), 0) = 0 then
    raise exception 'profile incomplete' using errcode = '22023';
  end if;
  if not public.has_consent('terms') or not public.has_consent('privacy') then
    raise exception 'terms and privacy consents are required' using errcode = '22023';
  end if;
  update public.profiles set onboarding_completed_at = coalesce(onboarding_completed_at, now())
   where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------- public view

-- Minimal public projection: never exposes birth year, minors, or incomplete profiles.
create view public.public_profiles as
  select id, handle, display_name, city, neighborhood, sports
    from public.profiles
   where not is_minor and onboarding_completed_at is not null;

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.consents enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy consents_select_own on public.consents
  for select to authenticated using (user_id = auth.uid());
-- Append-only log. Parental consent is never self-granted by the client (M5 flow, server side).
create policy consents_insert_own on public.consents
  for insert to authenticated
  with check (user_id = auth.uid() and kind <> 'parental');

revoke all on public.profiles, public.consents, public.public_profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (handle, display_name, city, neighborhood, sports, birth_year, language, recruiter_visible)
  on public.profiles to authenticated;
grant select, insert on public.consents to authenticated;
grant select on public.public_profiles to authenticated;
grant usage on sequence public.consents_id_seq to authenticated;

revoke all on function public.complete_onboarding() from public, anon;
grant execute on function public.complete_onboarding() to authenticated;
revoke all on function public.has_consent(public.consent_kind) from public, anon;
grant execute on function public.has_consent(public.consent_kind) to authenticated;
