-- M3 — Video, live moments, clips. Writes go through SECURITY DEFINER functions or service role.

create type public.moment_type as enum (
  'goal', 'assist', 'save',            -- foot
  'smash', 'bandeja', 'defense',       -- padel
  'ace', 'passing', 'volley'           -- tennis
);
create type public.video_status as enum ('recording', 'uploading', 'processing', 'ready', 'failed', 'expired');
create type public.clip_status as enum ('queued', 'processing', 'ready', 'failed');
create type public.clip_visibility as enum ('match', 'public');

create function public.moment_type_ok(s public.sport, t public.moment_type)
returns boolean language sql immutable as $$
  select (s = 'foot' and t in ('goal', 'assist', 'save'))
      or (s = 'padel' and t in ('smash', 'bandeja', 'defense'))
      or (s = 'tennis' and t in ('ace', 'passing', 'volley'));
$$;

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  source text not null default 'camera' check (source in ('camera', 'import')),
  provider text,
  provider_asset_id text,
  status public.video_status not null default 'recording',
  -- Moments are aligned on this instant: offset = marked_at - recording_started_at.
  recording_started_at timestamptz not null default now(),
  recording_ended_at timestamptz,
  duration_seconds numeric(8, 2) check (duration_seconds is null or duration_seconds between 0 and 7200),
  -- Originals are deleted after 30 days; clips live on.
  original_expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);
create unique index videos_one_active_recording on public.videos (match_id) where status = 'recording';
create index videos_match_idx on public.videos (match_id);
create index videos_expiry_idx on public.videos (original_expires_at) where status in ('processing', 'ready');

-- Bearer upload URL: readable only by the author.
create table public.video_uploads (
  video_id uuid primary key references public.videos (id) on delete cascade,
  upload_url text not null,
  created_at timestamptz not null default now()
);

create table public.moments (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  subject_user_id uuid references auth.users (id) on delete set null,
  type public.moment_type not null,
  marked_at timestamptz not null default now(),
  offset_ms integer not null check (offset_ms >= 0),
  created_at timestamptz not null default now()
);
create index moments_video_idx on public.moments (video_id, offset_ms);

create table public.clips (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null unique references public.moments (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null,
  format text not null default '9:16' check (format = '9:16'),
  status public.clip_status not null default 'queued',
  visibility public.clip_visibility not null default 'match',
  -- The 9:16 rendition is cut from the original by the ffmpeg worker and stored in the private
  -- `clips` Storage bucket; the app reads it through a signed URL.
  storage_path text,
  attempts smallint not null default 0,
  error text,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  check (end_ms > start_ms)
);
create index clips_match_idx on public.clips (match_id, created_at desc);

-- Provider assets to erase (account deletion, expiry): processed by a worker with provider credentials.
create table public.provider_deletions (
  id bigint generated always as identity primary key,
  provider text not null,
  asset_id text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create table public.push_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text not null default 'ios',
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

-- ---------------------------------------------------------------- erasure bookkeeping

create function public.queue_video_deletion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.provider is not null and old.provider_asset_id is not null then
    insert into public.provider_deletions (provider, asset_id, reason)
    values (old.provider, old.provider_asset_id, 'video deleted');
  end if;
  return old;
end $$;
create trigger videos_queue_deletion after delete on public.videos
  for each row execute function public.queue_video_deletion();

create function public.queue_clip_deletion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.storage_path is not null then
    insert into public.provider_deletions (provider, asset_id, reason)
    values ('supabase-storage', old.storage_path, 'clip deleted');
  end if;
  return old;
end $$;
create trigger clips_queue_deletion after delete on public.clips
  for each row execute function public.queue_clip_deletion();

-- ---------------------------------------------------------------- recording lifecycle

create function public.start_recording(p_match uuid, p_source text default 'camera', p_started_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_onboarded(); m public.matches; new_id uuid;
begin
  select * into m from public.matches where id = p_match;
  if not found or not public.is_participant(p_match) then
    raise exception 'not a participant' using errcode = '42501';
  end if;
  if m.status = 'cancelled' then
    raise exception 'match cancelled' using errcode = '22023';
  end if;
  if p_source not in ('camera', 'import') then
    raise exception 'invalid source' using errcode = '22023';
  end if;
  if p_source = 'camera' and m.starts_at > now() + interval '2 hours' then
    raise exception 'too early to record' using errcode = '22023';
  end if;
  insert into public.videos (match_id, author_id, source, status, recording_started_at)
  values (p_match, uid, p_source,
          case when p_source = 'camera' then 'recording'::public.video_status else 'uploading'::public.video_status end,
          coalesce(p_started_at, now()))
  returning id into new_id;
  return new_id;
exception when unique_violation then
  raise exception 'a recording is already in progress for this match' using errcode = '23505';
end $$;

create function public.stop_recording(p_video uuid, p_duration_seconds numeric)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_onboarded(); v public.videos;
begin
  select * into v from public.videos where id = p_video for update;
  if not found or v.author_id <> uid then
    raise exception 'only the filmer can stop the recording' using errcode = '42501';
  end if;
  if v.status <> 'recording' then
    raise exception 'not recording' using errcode = '22023';
  end if;
  update public.videos
     set status = 'uploading', recording_ended_at = now(), duration_seconds = p_duration_seconds
   where id = p_video;
end $$;

-- Imported footage: the author declares its duration once.
create function public.set_video_duration(p_video uuid, p_duration_seconds numeric)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_onboarded();
begin
  update public.videos set duration_seconds = p_duration_seconds
   where id = p_video and author_id = uid and status = 'uploading';
  if not found then raise exception 'video not found' using errcode = '42501'; end if;
end $$;

create function public.finish_upload(p_video uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_onboarded(); v public.videos;
begin
  select * into v from public.videos where id = p_video for update;
  if not found or v.author_id <> uid then
    raise exception 'only the filmer can finish the upload' using errcode = '42501';
  end if;
  -- Idempotent: the provider webhook may already have marked the video ready.
  if v.status in ('processing', 'ready') then return; end if;
  if v.status <> 'uploading' or v.duration_seconds is null then
    raise exception 'upload not finishable' using errcode = '22023';
  end if;
  update public.videos set status = 'processing' where id = p_video;
end $$;

-- ---------------------------------------------------------------- live moments

create function public.mark_moment(p_match uuid, p_type public.moment_type, p_subject uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_onboarded(); m public.matches; v public.videos;
  subject uuid := coalesce(p_subject, uid); new_id uuid; off integer;
begin
  select * into m from public.matches where id = p_match;
  if not found or not public.is_participant(p_match) then
    raise exception 'not a participant' using errcode = '42501';
  end if;
  if not public.moment_type_ok(m.sport, p_type) then
    raise exception 'moment type not valid for this sport' using errcode = '22023';
  end if;
  if not exists (select 1 from public.match_participants where match_id = p_match and user_id = subject) then
    raise exception 'subject is not a participant' using errcode = '22023';
  end if;
  select * into v from public.videos where match_id = p_match and status = 'recording';
  if not found then
    raise exception 'no recording in progress' using errcode = '22023';
  end if;
  off := greatest(0, floor(extract(epoch from (now() - v.recording_started_at)) * 1000))::int;
  insert into public.moments (match_id, video_id, created_by, subject_user_id, type, offset_ms)
  values (p_match, v.id, uid, subject, p_type, off)
  returning id into new_id;
  return new_id;
end $$;

-- Imported footage: the author marks moments while scrubbing their own video (before sending it).
create function public.add_moment_at(p_video uuid, p_type public.moment_type, p_subject uuid, p_offset_ms integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_onboarded(); v public.videos; m public.matches; new_id uuid; subject uuid;
begin
  select * into v from public.videos where id = p_video;
  if not found or v.author_id <> uid or v.source <> 'import' then
    raise exception 'only the author of an imported video can do this' using errcode = '42501';
  end if;
  if v.status <> 'uploading' or v.duration_seconds is null then
    raise exception 'video is not open for marking' using errcode = '22023';
  end if;
  if p_offset_ms < 0 or p_offset_ms >= floor(v.duration_seconds * 1000) then
    raise exception 'offset outside the video' using errcode = '22023';
  end if;
  select * into m from public.matches where id = v.match_id;
  subject := coalesce(p_subject, uid);
  if not public.moment_type_ok(m.sport, p_type) then
    raise exception 'moment type not valid for this sport' using errcode = '22023';
  end if;
  if not exists (select 1 from public.match_participants where match_id = v.match_id and user_id = subject) then
    raise exception 'subject is not a participant' using errcode = '22023';
  end if;
  insert into public.moments (match_id, video_id, created_by, subject_user_id, type, marked_at, offset_ms)
  values (v.match_id, p_video, uid, subject, p_type, v.recording_started_at + (p_offset_ms || ' milliseconds')::interval, p_offset_ms)
  returning id into new_id;
  return new_id;
end $$;

-- Matches the caller can film or mark moments for (started within 7 days, or about to start).
create function public.my_matches_for_filming()
returns table (
  id uuid, sport public.sport, starts_at timestamptz, place text, city text,
  recording_video_id uuid, filmer_is_me boolean
) language sql stable security definer set search_path = public as $$
  select m.id, m.sport, m.starts_at, coalesce(c.name, m.venue), m.city,
         v.id, coalesce(v.author_id = auth.uid(), false)
    from public.matches m
    join public.match_participants mp on mp.match_id = m.id and mp.user_id = auth.uid()
    left join public.clubs c on c.id = m.club_id
    left join public.videos v on v.match_id = m.id and v.status = 'recording'
   where m.status <> 'cancelled'
     and m.starts_at between now() - interval '7 days' and now() + interval '2 hours'
   order by m.starts_at desc
   limit 20;
$$;

-- Service role only: one 8 s before / 4 s after clip per moment, clamped to the video length.
create function public.plan_clips(p_video uuid)
returns setof public.clips language plpgsql security definer set search_path = public as $$
declare v public.videos; dur_ms integer;
begin
  select * into v from public.videos where id = p_video;
  if not found or v.duration_seconds is null then
    raise exception 'video has no duration' using errcode = '22023';
  end if;
  dur_ms := floor(v.duration_seconds * 1000)::int;
  return query
  insert into public.clips (moment_id, match_id, video_id, start_ms, end_ms)
  select mo.id, mo.match_id, mo.video_id,
         greatest(0, mo.offset_ms - 8000),
         least(dur_ms, mo.offset_ms + 4000)
    from public.moments mo
   where mo.video_id = p_video and mo.offset_ms < dur_ms
     and least(dur_ms, mo.offset_ms + 4000) > greatest(0, mo.offset_ms - 8000)
  on conflict (moment_id) do nothing
  returning *;
end $$;

-- Worker queue: atomically claims queued clips whose original is ready. Gives up after 3 attempts.
create function public.claim_clips(p_limit integer default 5)
returns table (clip_id uuid, video_id uuid, match_id uuid, start_ms integer, end_ms integer,
               provider text, provider_asset_id text)
language plpgsql security definer set search_path = public as $$
begin
  update public.clips set status = 'failed', error = coalesce(error, 'too many attempts')
   where status = 'queued' and attempts >= 3;
  return query
  with picked as (
    select c.id from public.clips c join public.videos v on v.id = c.video_id
     where c.status = 'queued' and c.attempts < 3 and v.status = 'ready'
     order by c.created_at
     for update of c skip locked
     limit greatest(p_limit, 1)
  )
  update public.clips c set status = 'processing', attempts = c.attempts + 1
    from picked, public.videos v
   where c.id = picked.id and v.id = c.video_id
  returning c.id, c.video_id, c.match_id, c.start_ms, c.end_ms, v.provider, v.provider_asset_id;
end $$;

-- Releases clips stuck in 'processing' (worker crashed) back to the queue.
create function public.requeue_stuck_clips(p_older_than interval default interval '15 minutes')
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.clips set status = 'queued'
   where status = 'processing' and created_at < now() - p_older_than and ready_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- Public sharing needs every player's image consent for this match and no minor on the pitch.
create function public.set_clip_visibility(p_clip uuid, p_visibility public.clip_visibility)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_onboarded(); c public.clips; mo public.moments; v public.videos;
begin
  select * into c from public.clips where id = p_clip for update;
  if not found or not public.is_participant(c.match_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into mo from public.moments where id = c.moment_id;
  select * into v from public.videos where id = c.video_id;
  if uid not in (v.author_id, mo.created_by) and uid is distinct from mo.subject_user_id then
    raise exception 'only the filmer or the player concerned can change visibility' using errcode = '42501';
  end if;
  if p_visibility = 'public' then
    if exists (select 1 from public.match_participants where match_id = c.match_id and not image_consent) then
      raise exception 'every player must have consented to be filmed' using errcode = '22023';
    end if;
    if exists (select 1 from public.match_participants mp join public.profiles p on p.id = mp.user_id
                where mp.match_id = c.match_id and p.is_minor) then
      raise exception 'clips with minors cannot be public' using errcode = '22023';
    end if;
  end if;
  update public.clips set visibility = p_visibility where id = p_clip;
end $$;

-- Cron / service role: originals expire 30 days after upload; clips are kept.
create function public.expire_originals()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with expired as (
    update public.videos set status = 'expired'
     where original_expires_at <= now() and status in ('processing', 'ready', 'failed', 'uploading')
    returning provider, provider_asset_id
  ), q as (
    insert into public.provider_deletions (provider, asset_id, reason)
    select provider, provider_asset_id, 'original expired' from expired
     where provider is not null and provider_asset_id is not null
  )
  select count(*) into n from expired;
  return n;
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('expire-originals', '17 3 * * *', 'select public.expire_originals()');
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.moments, public.videos;
  end if;
end $$;

-- ---------------------------------------------------------------- RLS and grants

alter table public.videos enable row level security;
alter table public.video_uploads enable row level security;
alter table public.moments enable row level security;
alter table public.clips enable row level security;
alter table public.provider_deletions enable row level security;
alter table public.push_tokens enable row level security;

create policy videos_read on public.videos for select to authenticated
  using (public.is_participant(match_id));
create policy uploads_read_author on public.video_uploads for select to authenticated
  using (exists (select 1 from public.videos v where v.id = video_id and v.author_id = auth.uid()));
create policy moments_read on public.moments for select to authenticated
  using (public.is_participant(match_id));
create policy clips_read on public.clips for select to authenticated
  using (public.is_participant(match_id) or visibility = 'public');
create policy push_own on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.videos, public.video_uploads, public.moments, public.clips,
  public.provider_deletions, public.push_tokens from anon, authenticated;
grant select on public.videos, public.moments to authenticated;
grant select (id, moment_id, match_id, video_id, start_ms, end_ms, format, status, visibility,
              storage_path, created_at, ready_at) on public.clips to authenticated;
grant select on public.video_uploads to authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;

revoke all on function
  public.start_recording(uuid, text, timestamptz), public.stop_recording(uuid, numeric),
  public.set_video_duration(uuid, numeric), public.finish_upload(uuid),
  public.mark_moment(uuid, public.moment_type, uuid), public.plan_clips(uuid),
  public.add_moment_at(uuid, public.moment_type, uuid, integer), public.my_matches_for_filming(),
  public.set_clip_visibility(uuid, public.clip_visibility), public.expire_originals(),
  public.moment_type_ok(public.sport, public.moment_type), public.queue_video_deletion(),
  public.queue_clip_deletion(), public.claim_clips(integer), public.requeue_stuck_clips(interval)
  from public, anon, authenticated;
grant execute on function
  public.start_recording(uuid, text, timestamptz), public.stop_recording(uuid, numeric),
  public.set_video_duration(uuid, numeric), public.finish_upload(uuid),
  public.mark_moment(uuid, public.moment_type, uuid),
  public.add_moment_at(uuid, public.moment_type, uuid, integer), public.my_matches_for_filming(),
  public.set_clip_visibility(uuid, public.clip_visibility)
  to authenticated;
-- plan_clips / expire_originals stay service-role (and cron) only.
grant execute on function public.plan_clips(uuid), public.expire_originals(), public.claim_clips(integer),
  public.requeue_stuck_clips(interval) to service_role;

-- ---------------------------------------------------------------- Storage (hosted/local Supabase)

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('clips', 'clips', false)
    on conflict (id) do nothing;
    -- Signed URLs are issued only for clips the caller may see (participant or public clip).
    create policy clips_read_objects on storage.objects for select to authenticated
      using (bucket_id = 'clips' and exists (
        select 1 from public.clips c
         where c.storage_path = storage.objects.name
           and (public.is_participant(c.match_id) or c.visibility = 'public')));
  end if;
end $$;
