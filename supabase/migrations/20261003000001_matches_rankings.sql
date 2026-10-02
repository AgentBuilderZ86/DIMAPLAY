-- M2 — Matches, teams, score confirmation, Elo ratings, rankings.
-- All writes go through SECURITY DEFINER functions: clients have SELECT-only table access.

create type public.match_format as enum ('5v5', 'double', 'simple');
create type public.match_level as enum ('any', 'beginner', 'intermediate', 'advanced');
create type public.match_status as enum ('open', 'cancelled', 'finished');
create type public.team_side as enum ('A', 'B');
create type public.result_status as enum ('pending', 'confirmed', 'contested', 'arbitrated');

create function public.format_capacity(f public.match_format)
returns smallint language sql immutable as $$
  select case f when '5v5' then 10 when 'double' then 4 else 2 end::smallint;
$$;

-- Foot is 5v5, padel is doubles, tennis is singles (v1 product rule).
create function public.sport_format_ok(s public.sport, f public.match_format)
returns boolean language sql immutable as $$
  select (s = 'foot' and f = '5v5') or (s = 'padel' and f = 'double') or (s = 'tennis' and f = 'simple');
$$;

-- ---------------------------------------------------------------- tables

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  city text not null,
  neighborhood text,
  sports public.sport[] not null default '{}',
  address text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.moderators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  sport public.sport not null,
  club_id uuid references public.clubs (id) on delete set null,
  venue text check (char_length(venue) between 2 and 80),
  city text not null check (char_length(city) between 2 and 60),
  neighborhood text check (char_length(neighborhood) between 2 and 60),
  starts_at timestamptz not null,
  format public.match_format not null,
  level public.match_level not null default 'any',
  capacity smallint not null,
  creator_id uuid references auth.users (id) on delete set null,
  status public.match_status not null default 'open',
  created_at timestamptz not null default now(),
  check (public.sport_format_ok(sport, format)),
  check (capacity = public.format_capacity(format)),
  check (club_id is not null or venue is not null)
);
create index matches_open_idx on public.matches (sport, city, starts_at) where status = 'open';

create table public.match_participants (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  team public.team_side,
  -- image-rights consent given for THIS match (loi 09-08); mirrored in the consents log
  image_consent boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
create index match_participants_user_idx on public.match_participants (user_id);

create table public.match_results (
  match_id uuid primary key references public.matches (id) on delete cascade,
  score_a smallint not null check (score_a between 0 and 99),
  score_b smallint not null check (score_b between 0 and 99),
  detail jsonb,
  status public.result_status not null default 'pending',
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_team public.team_side not null,
  submitted_at timestamptz not null default now(),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  contested_by uuid references auth.users (id) on delete set null,
  contested_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  elo_applied_at timestamptz
);

create table public.ratings (
  user_id uuid not null references auth.users (id) on delete cascade,
  sport public.sport not null,
  elo numeric(7, 2) not null default 1000,
  matches_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, sport)
);

create table public.rating_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  sport public.sport not null,
  match_id uuid references public.matches (id) on delete set null,
  elo_before numeric(7, 2) not null,
  elo_after numeric(7, 2) not null,
  delta numeric(6, 2) not null,
  created_at timestamptz not null default now()
);
create index rating_history_user_idx on public.rating_history (user_id, sport, created_at desc);

create table public.ranking_snapshots (
  taken_on date not null,
  sport public.sport not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  rank_morocco integer not null,
  rank_city integer not null,
  rank_neighborhood integer not null,
  primary key (taken_on, sport, user_id)
);

-- ---------------------------------------------------------------- helpers

create function public.require_onboarded()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not exists (
    select 1 from public.profiles where id = uid and onboarding_completed_at is not null
  ) then
    raise exception 'onboarding required' using errcode = '42501';
  end if;
  return uid;
end $$;

create function public.is_participant(p_match uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.match_participants
                  where match_id = p_match and user_id = auth.uid());
$$;

create function public.is_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.moderators where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------- match lifecycle

create function public.create_match(
  p_sport public.sport,
  p_format public.match_format,
  p_starts_at timestamptz,
  p_club_id uuid,
  p_venue text,
  p_city text,
  p_neighborhood text,
  p_level public.match_level default 'any',
  p_image_consent boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_onboarded(); new_id uuid;
begin
  if p_starts_at <= now() then
    raise exception 'match must start in the future' using errcode = '22023';
  end if;
  if not public.sport_format_ok(p_sport, p_format) then
    raise exception 'format not allowed for this sport' using errcode = '22023';
  end if;
  insert into public.matches (sport, club_id, venue, city, neighborhood, starts_at, format, level, capacity, creator_id)
  values (p_sport, p_club_id, nullif(trim(p_venue), ''), trim(p_city), nullif(trim(p_neighborhood), ''),
          p_starts_at, p_format, p_level, public.format_capacity(p_format), uid)
  returning id into new_id;
  insert into public.match_participants (match_id, user_id, team, image_consent)
  values (new_id, uid, 'A', p_image_consent);
  insert into public.consents (user_id, kind, version, granted, match_id)
  values (uid, 'image', 'match', p_image_consent, new_id);
  return new_id;
end $$;

create function public.join_match(p_match uuid, p_image_consent boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_onboarded(); m public.matches; joined integer;
begin
  select * into m from public.matches where id = p_match for update;
  if not found or m.status <> 'open' then
    raise exception 'match not open' using errcode = '22023';
  end if;
  if m.starts_at <= now() then
    raise exception 'match already started' using errcode = '22023';
  end if;
  if exists (select 1 from public.match_participants where match_id = p_match and user_id = uid) then
    raise exception 'already joined' using errcode = '23505';
  end if;
  select count(*) into joined from public.match_participants where match_id = p_match;
  if joined >= m.capacity then
    raise exception 'match full' using errcode = '22023';
  end if;
  insert into public.match_participants (match_id, user_id, image_consent) values (p_match, uid, p_image_consent);
  insert into public.consents (user_id, kind, version, granted, match_id)
  values (uid, 'image', 'match', p_image_consent, p_match);
end $$;

create function public.leave_match(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_onboarded(); m public.matches;
begin
  select * into m from public.matches where id = p_match for update;
  if not found or not public.is_participant(p_match) then
    raise exception 'not a participant' using errcode = '42501';
  end if;
  if m.creator_id = uid then
    raise exception 'creator must cancel the match instead' using errcode = '22023';
  end if;
  if m.status <> 'open' or m.starts_at <= now() then
    raise exception 'cannot leave this match' using errcode = '22023';
  end if;
  delete from public.match_participants where match_id = p_match and user_id = uid;
end $$;

create function public.cancel_match(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_onboarded(); m public.matches;
begin
  select * into m from public.matches where id = p_match for update;
  if not found or m.creator_id is distinct from uid then
    raise exception 'only the creator can cancel' using errcode = '42501';
  end if;
  if m.status <> 'open' or exists (select 1 from public.match_results where match_id = p_match) then
    raise exception 'match cannot be cancelled' using errcode = '22023';
  end if;
  update public.matches set status = 'cancelled' where id = p_match;
end $$;

create function public.assign_team(p_match uuid, p_user uuid, p_team public.team_side)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_onboarded(); m public.matches; in_team integer;
begin
  select * into m from public.matches where id = p_match for update;
  if not found or m.creator_id is distinct from uid then
    raise exception 'only the creator can assign teams' using errcode = '42501';
  end if;
  if m.status <> 'open' or exists (select 1 from public.match_results where match_id = p_match) then
    raise exception 'teams are locked' using errcode = '22023';
  end if;
  if not exists (select 1 from public.match_participants where match_id = p_match and user_id = p_user) then
    raise exception 'not a participant' using errcode = '22023';
  end if;
  if p_team is not null then
    select count(*) into in_team from public.match_participants
     where match_id = p_match and team = p_team and user_id <> p_user;
    if in_team >= m.capacity / 2 then
      raise exception 'team is full' using errcode = '22023';
    end if;
  end if;
  update public.match_participants set team = p_team where match_id = p_match and user_id = p_user;
end $$;

-- Greedy balance by Elo: strongest first, each to the team with the lower total that still has room.
create function public.auto_balance_teams(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_onboarded(); m public.matches; p record;
  sum_a numeric := 0; sum_b numeric := 0; n_a integer := 0; n_b integer := 0; half integer;
begin
  select * into m from public.matches where id = p_match for update;
  if not found or m.creator_id is distinct from uid then
    raise exception 'only the creator can assign teams' using errcode = '42501';
  end if;
  if m.status <> 'open' or exists (select 1 from public.match_results where match_id = p_match) then
    raise exception 'teams are locked' using errcode = '22023';
  end if;
  half := m.capacity / 2;
  if (select count(*) from public.match_participants where match_id = p_match) <> m.capacity then
    raise exception 'match is not full' using errcode = '22023';
  end if;
  for p in
    select mp.user_id, coalesce(r.elo, 1000) as elo
      from public.match_participants mp
      left join public.ratings r on r.user_id = mp.user_id and r.sport = m.sport
     where mp.match_id = p_match
     order by coalesce(r.elo, 1000) desc, mp.user_id
  loop
    if n_a < half and (n_b >= half or sum_a <= sum_b) then
      update public.match_participants set team = 'A' where match_id = p_match and user_id = p.user_id;
      sum_a := sum_a + p.elo; n_a := n_a + 1;
    else
      update public.match_participants set team = 'B' where match_id = p_match and user_id = p.user_id;
      sum_b := sum_b + p.elo; n_b := n_b + 1;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- Elo

create function public.apply_elo(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.match_results; m public.matches; p record;
  ra numeric; rb numeric; ea numeric; sa numeric; mult numeric; k numeric; delta numeric;
begin
  select * into r from public.match_results where match_id = p_match for update;
  if not found or r.elo_applied_at is not null then return; end if;
  if r.status not in ('confirmed', 'arbitrated') then
    raise exception 'result not confirmed' using errcode = '22023';
  end if;
  select * into m from public.matches where id = p_match;

  insert into public.ratings (user_id, sport)
  select user_id, m.sport from public.match_participants where match_id = p_match
  on conflict do nothing;

  select avg(rt.elo) into ra from public.match_participants mp
    join public.ratings rt on rt.user_id = mp.user_id and rt.sport = m.sport
   where mp.match_id = p_match and mp.team = 'A';
  select avg(rt.elo) into rb from public.match_participants mp
    join public.ratings rt on rt.user_id = mp.user_id and rt.sport = m.sport
   where mp.match_id = p_match and mp.team = 'B';

  ea := 1 / (1 + power(10, (rb - ra) / 400));
  sa := case when r.score_a > r.score_b then 1 when r.score_a = r.score_b then 0.5 else 0 end;
  -- Foot only: small goal-difference bonus, capped at +20%.
  mult := case when m.sport = 'foot' then 1 + 0.05 * least(abs(r.score_a - r.score_b), 4) else 1 end;

  for p in
    select mp.user_id, mp.team, rt.elo, rt.matches_count
      from public.match_participants mp
      join public.ratings rt on rt.user_id = mp.user_id and rt.sport = m.sport
     where mp.match_id = p_match and mp.team is not null
  loop
    k := case when p.matches_count < 5 then 40 else 24 end;  -- faster moves while calibrating
    delta := round(k * mult * (case when p.team = 'A' then sa - ea else (1 - sa) - (1 - ea) end), 2);
    update public.ratings
       set elo = elo + delta, matches_count = matches_count + 1, updated_at = now()
     where user_id = p.user_id and sport = m.sport;
    insert into public.rating_history (user_id, sport, match_id, elo_before, elo_after, delta)
    values (p.user_id, m.sport, p_match, p.elo, p.elo + delta, delta);
  end loop;

  update public.match_results set elo_applied_at = now() where match_id = p_match;
  update public.matches set status = 'finished' where id = p_match;
end $$;

-- ---------------------------------------------------------------- results

create function public.submit_result(p_match uuid, p_score_a integer, p_score_b integer, p_detail jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_onboarded(); m public.matches; my_team public.team_side; existing public.result_status;
begin
  select * into m from public.matches where id = p_match for update;
  if not found or m.status <> 'open' then
    raise exception 'match not open' using errcode = '22023';
  end if;
  select team into my_team from public.match_participants where match_id = p_match and user_id = uid;
  if not found then raise exception 'not a participant' using errcode = '42501'; end if;
  if my_team is null then raise exception 'assign teams first' using errcode = '22023'; end if;
  if m.starts_at > now() then raise exception 'match has not started' using errcode = '22023'; end if;
  if (select count(*) from public.match_participants where match_id = p_match and team = 'A') <> m.capacity / 2
     or (select count(*) from public.match_participants where match_id = p_match and team = 'B') <> m.capacity / 2 then
    raise exception 'teams are incomplete' using errcode = '22023';
  end if;
  if m.sport <> 'foot' and p_score_a = p_score_b then
    raise exception 'draws are not allowed in this sport' using errcode = '22023';
  end if;
  select status into existing from public.match_results where match_id = p_match;
  if found then raise exception 'a result already exists' using errcode = '23505'; end if;
  insert into public.match_results (match_id, score_a, score_b, detail, submitted_by, submitted_team)
  values (p_match, p_score_a, p_score_b, p_detail, uid, my_team);
end $$;

create function public.confirm_result(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_onboarded(); r public.match_results; my_team public.team_side;
begin
  select * into r from public.match_results where match_id = p_match for update;
  if not found or r.status <> 'pending' then
    raise exception 'no pending result' using errcode = '22023';
  end if;
  select team into my_team from public.match_participants where match_id = p_match and user_id = uid;
  if not found then raise exception 'not a participant' using errcode = '42501'; end if;
  if my_team is null or my_team = r.submitted_team then
    raise exception 'the other team must confirm' using errcode = '42501';
  end if;
  update public.match_results
     set status = 'confirmed', confirmed_by = uid, confirmed_at = now() where match_id = p_match;
  perform public.apply_elo(p_match);
end $$;

create function public.contest_result(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_onboarded(); r public.match_results; my_team public.team_side;
begin
  select * into r from public.match_results where match_id = p_match for update;
  if not found or r.status <> 'pending' then
    raise exception 'no pending result' using errcode = '22023';
  end if;
  select team into my_team from public.match_participants where match_id = p_match and user_id = uid;
  if not found then raise exception 'not a participant' using errcode = '42501'; end if;
  if my_team is null or my_team = r.submitted_team then
    raise exception 'the other team must respond' using errcode = '42501';
  end if;
  update public.match_results
     set status = 'contested', contested_by = uid, contested_at = now() where match_id = p_match;
end $$;

create function public.arbitrate_result(p_match uuid, p_score_a integer, p_score_b integer)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.match_results; s public.sport;
begin
  if not public.is_moderator() then
    raise exception 'moderators only' using errcode = '42501';
  end if;
  select * into r from public.match_results where match_id = p_match for update;
  if not found or r.status <> 'contested' then
    raise exception 'no contested result' using errcode = '22023';
  end if;
  select sport into s from public.matches where id = p_match;
  if s <> 'foot' and p_score_a = p_score_b then
    raise exception 'draws are not allowed in this sport' using errcode = '22023';
  end if;
  update public.match_results
     set score_a = p_score_a, score_b = p_score_b, status = 'arbitrated', resolved_by = uid
   where match_id = p_match;
  perform public.apply_elo(p_match);
end $$;

-- ---------------------------------------------------------------- reads

create function public.list_open_matches(p_sport public.sport default null, p_city text default null)
returns table (
  id uuid, sport public.sport, format public.match_format, level public.match_level,
  starts_at timestamptz, city text, neighborhood text, club_name text, venue text,
  capacity smallint, joined_count integer, joined boolean
) language sql stable security definer set search_path = public as $$
  select m.id, m.sport, m.format, m.level, m.starts_at, m.city, m.neighborhood, c.name, m.venue,
         m.capacity,
         (select count(*)::int from public.match_participants mp where mp.match_id = m.id),
         exists (select 1 from public.match_participants mp where mp.match_id = m.id and mp.user_id = auth.uid())
    from public.matches m
    left join public.clubs c on c.id = m.club_id
   where auth.uid() is not null
     and m.status = 'open' and m.starts_at > now() - interval '3 hours'
     and (p_sport is null or m.sport = p_sport)
     and (p_city is null or m.city = p_city)
   order by m.starts_at
   limit 100;
$$;

create function public.match_joined_count(p_match uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.match_participants
   where match_id = p_match and auth.uid() is not null;
$$;

create function public.get_match_participants(p_match uuid)
returns table (
  user_id uuid, display_name text, handle text, team public.team_side,
  elo numeric, is_creator boolean, image_consent boolean
) language sql stable security definer set search_path = public as $$
  select mp.user_id, p.display_name, p.handle, mp.team, coalesce(r.elo, 1000),
         (m.creator_id = mp.user_id), mp.image_consent
    from public.match_participants mp
    join public.matches m on m.id = mp.match_id
    join public.profiles p on p.id = mp.user_id
    left join public.ratings r on r.user_id = mp.user_id and r.sport = m.sport
   where mp.match_id = p_match and public.is_participant(p_match)
   order by mp.team nulls last, mp.joined_at;
$$;

-- ---------------------------------------------------------------- rankings

-- Public ranking base: adults with a finished onboarding and at least one counted match.
create materialized view public.ranking_base as
select r.sport, r.user_id, r.elo, r.matches_count, p.display_name, p.handle, p.city, p.neighborhood,
       row_number() over (partition by r.sport order by r.elo desc, r.matches_count desc, r.user_id) as rank_morocco,
       row_number() over (partition by r.sport, p.city order by r.elo desc, r.matches_count desc, r.user_id) as rank_city,
       row_number() over (partition by r.sport, p.city, p.neighborhood order by r.elo desc, r.matches_count desc, r.user_id) as rank_neighborhood
  from public.ratings r
  join public.profiles p on p.id = r.user_id
 where not p.is_minor and p.onboarding_completed_at is not null and r.matches_count >= 1
   and p.city is not null and p.neighborhood is not null;
create unique index ranking_base_pk on public.ranking_base (sport, user_id);

create function public.refresh_rankings()
returns void language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently public.ranking_base;
  insert into public.ranking_snapshots (taken_on, sport, user_id, rank_morocco, rank_city, rank_neighborhood)
  select current_date, sport, user_id, rank_morocco, rank_city, rank_neighborhood from public.ranking_base
  on conflict (taken_on, sport, user_id) do update
    set rank_morocco = excluded.rank_morocco, rank_city = excluded.rank_city,
        rank_neighborhood = excluded.rank_neighborhood;
end $$;

-- p_scope: 'neighborhood' | 'city' | 'morocco'. Neighbourhood/city come from the caller's profile.
create function public.get_ranking(p_sport public.sport, p_scope text, p_limit integer default 50)
returns table (
  pos integer, user_id uuid, display_name text, handle text, city text, neighborhood text,
  elo numeric, matches_count integer, calibrating boolean, change7d integer, is_me boolean
) language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.require_onboarded(); my_city text; my_hood text;
begin
  if p_scope not in ('neighborhood', 'city', 'morocco') then
    raise exception 'invalid scope' using errcode = '22023';
  end if;
  select pr.city, pr.neighborhood into my_city, my_hood from public.profiles pr where pr.id = uid;
  return query
  select (case p_scope when 'neighborhood' then b.rank_neighborhood when 'city' then b.rank_city else b.rank_morocco end)::int,
         b.user_id, b.display_name, b.handle, b.city, b.neighborhood, b.elo, b.matches_count,
         b.matches_count < 5,
         (select (case p_scope when 'neighborhood' then s.rank_neighborhood when 'city' then s.rank_city else s.rank_morocco end)
                 - (case p_scope when 'neighborhood' then b.rank_neighborhood when 'city' then b.rank_city else b.rank_morocco end)
            from public.ranking_snapshots s
           where s.sport = b.sport and s.user_id = b.user_id and s.taken_on <= current_date - 7
           order by s.taken_on desc limit 1)::int,
         b.user_id = uid
    from public.ranking_base b
   where b.sport = p_sport
     and (p_scope = 'morocco'
          or (p_scope = 'city' and b.city = my_city)
          or (p_scope = 'neighborhood' and b.city = my_city and b.neighborhood = my_hood))
   order by 1
   limit least(greatest(p_limit, 1), 200);
end $$;

-- The caller's own rating (always visible to them, even when hidden from public rankings).
create function public.get_my_standing(p_sport public.sport)
returns table (
  elo numeric, matches_count integer, calibrating boolean,
  rank_neighborhood integer, rank_city integer, rank_morocco integer
) language sql stable security definer set search_path = public as $$
  select coalesce(r.elo, 1000), coalesce(r.matches_count, 0), coalesce(r.matches_count, 0) < 5,
         b.rank_neighborhood::int, b.rank_city::int, b.rank_morocco::int
    from (select 1) one
    left join public.ratings r on r.user_id = auth.uid() and r.sport = p_sport
    left join public.ranking_base b on b.user_id = auth.uid() and b.sport = p_sport
   where auth.uid() is not null;
$$;

-- Daily refresh when pg_cron is available (Supabase hosted); no-op elsewhere.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('refresh-rankings', '*/15 * * * *', 'select public.refresh_rankings()');
  end if;
end $$;

-- ---------------------------------------------------------------- RLS and grants

alter table public.clubs enable row level security;
alter table public.moderators enable row level security;
alter table public.matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.match_results enable row level security;
alter table public.ratings enable row level security;
alter table public.rating_history enable row level security;
alter table public.ranking_snapshots enable row level security;

create policy clubs_read on public.clubs for select to authenticated using (true);
create policy matches_read on public.matches for select to authenticated
  using (status <> 'cancelled' or creator_id = auth.uid());
create policy participants_read on public.match_participants for select to authenticated
  using (public.is_participant(match_id));
create policy results_read on public.match_results for select to authenticated
  using (public.is_participant(match_id));
create policy ratings_read_own on public.ratings for select to authenticated using (user_id = auth.uid());
create policy history_read_own on public.rating_history for select to authenticated using (user_id = auth.uid());

revoke all on public.clubs, public.moderators, public.matches, public.match_participants,
  public.match_results, public.ratings, public.rating_history, public.ranking_snapshots,
  public.ranking_base from anon, authenticated;
grant select on public.clubs, public.matches, public.match_participants, public.match_results,
  public.ratings, public.rating_history to authenticated;

-- Functions: authenticated only (never anon); internal ones are not callable by clients.
revoke all on function
  public.create_match(public.sport, public.match_format, timestamptz, uuid, text, text, text, public.match_level, boolean),
  public.join_match(uuid, boolean), public.leave_match(uuid), public.cancel_match(uuid),
  public.assign_team(uuid, uuid, public.team_side), public.auto_balance_teams(uuid),
  public.submit_result(uuid, integer, integer, jsonb), public.confirm_result(uuid), public.contest_result(uuid),
  public.arbitrate_result(uuid, integer, integer),
  public.list_open_matches(public.sport, text), public.get_match_participants(uuid), public.match_joined_count(uuid),
  public.get_ranking(public.sport, text, integer), public.get_my_standing(public.sport),
  public.is_participant(uuid), public.is_moderator(), public.require_onboarded(),
  public.apply_elo(uuid), public.refresh_rankings()
  from public, anon, authenticated;
grant execute on function
  public.create_match(public.sport, public.match_format, timestamptz, uuid, text, text, text, public.match_level, boolean),
  public.join_match(uuid, boolean), public.leave_match(uuid), public.cancel_match(uuid),
  public.assign_team(uuid, uuid, public.team_side), public.auto_balance_teams(uuid),
  public.submit_result(uuid, integer, integer, jsonb), public.confirm_result(uuid), public.contest_result(uuid),
  public.arbitrate_result(uuid, integer, integer),
  public.list_open_matches(public.sport, text), public.get_match_participants(uuid), public.match_joined_count(uuid),
  public.get_ranking(public.sport, text, integer), public.get_my_standing(public.sport),
  public.is_participant(uuid), public.is_moderator()
  to authenticated;
