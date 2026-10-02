-- M3: recording lifecycle, live moments from several phones, clip planning, consent, expiry, erasure.

select t.mkuser(n) from generate_series(21, 25) n;
select t.mkuser(26, 'Maârif', 'Casablanca', (extract(year from now())::int - 15)::smallint);

set role authenticated;

-- padel match P: creator 21, players 22, 23, 24 (24 refuses to be filmed)
select t.act_as(t.uid(21));
select public.create_match('padel', 'double', now() + interval '1 day', null, 'Padel Corniche', 'Casablanca', 'Maârif', 'any', true) as pid \gset
select t.act_as(t.uid(22)); select public.join_match(:'pid', true);
select t.act_as(t.uid(23)); select public.join_match(:'pid', true);
select t.act_as(t.uid(24)); select public.join_match(:'pid', false);

-- ============================================================ recording rules
select t.act_as(t.uid(22));
select t.throws(format('select public.start_recording(%L)', :'pid'), '22023');      -- far too early
reset role;
update public.matches set starts_at = now() - interval '10 minutes' where id = :'pid';
set role authenticated;
select t.act_as(t.uid(25));
select t.throws(format('select public.start_recording(%L)', :'pid'), '42501');      -- outsider cannot film
select t.act_as(t.uid(22));
select public.start_recording(:'pid') as vid \gset
select t.act_as(t.uid(23));
select t.throws(format('select public.start_recording(%L)', :'pid'), '23505');      -- one active recording per match

-- ============================================================ live moments from several phones
select t.act_as(t.uid(21));
select public.mark_moment(:'pid', 'smash', t.uid(23)) as m1 \gset
select t.act_as(t.uid(23));
select public.mark_moment(:'pid', 'bandeja') as m2 \gset
select t.act_as(t.uid(24));
select public.mark_moment(:'pid', 'defense') as m3 \gset
select t.throws(format('select public.mark_moment(%L, %L)', :'pid', 'goal'), '22023');                     -- foot move in padel
select t.throws(format('select public.mark_moment(%L, %L, %L)', :'pid', 'smash', t.uid(25)), '22023');     -- subject not in match
select t.act_as(t.uid(25));
select t.throws(format('select public.mark_moment(%L, %L)', :'pid', 'smash'), '42501');                    -- outsider
select t.ok((select count(*) from public.moments) = 0, 'outsider sees no moments');
select t.ok((select count(*) from public.videos) = 0, 'outsider sees no videos');
select t.act_as(t.uid(21));
select t.ok((select count(*) from public.moments where match_id = :'pid') = 3, 'participants see the 3 moments');
select t.ok((select count(distinct created_by) from public.moments) = 3, 'moments come from 3 different phones');

-- offsets are measured from the recording start
reset role;
update public.videos set recording_started_at = now() - interval '5 minutes' where id = :'vid';
update public.moments set offset_ms = 3000 where id = :'m1';
update public.moments set offset_ms = 300000 where id = :'m2';
update public.moments set offset_ms = 595000 where id = :'m3';
set role authenticated;
select t.act_as(t.uid(22));
select public.mark_moment(:'pid', 'smash') as m4 \gset
select t.ok((select offset_ms from public.moments where id = :'m4') between 299000 and 302000, 'offset aligned on recording start (~300 s)');

-- ============================================================ stop, upload, process
select t.act_as(t.uid(21));
select t.throws(format('select public.stop_recording(%L, 600)', :'vid'), '42501');   -- only the filmer
select t.act_as(t.uid(22));
select public.stop_recording(:'vid', 600);
select t.throws(format('select public.stop_recording(%L, 600)', :'vid'), '22023');
select t.throws(format('select public.mark_moment(%L, %L)', :'pid', 'smash'), '22023');                     -- recording is over
select public.finish_upload(:'vid');
select public.finish_upload(:'vid');   -- idempotent
select t.ok((select status from public.videos where id = :'vid') = 'processing', 'still processing after a repeated finish');

-- ============================================================ clip planning (service role only)
select t.throws(format('select * from public.plan_clips(%L)', :'vid'), '42501');
reset role;
-- a moment past the end of the footage is ignored
insert into public.moments (match_id, video_id, created_by, subject_user_id, type, offset_ms)
values (:'pid', :'vid', t.uid(21), t.uid(21), 'smash', 700000);
select t.ok((select count(*) from public.plan_clips(:'vid')) = 4, 'one clip per usable moment (m1, m2, m3, m4)');
select t.ok((select start_ms from public.clips where moment_id = :'m1') = 0, 'start clamped to 0');
select t.ok((select end_ms from public.clips where moment_id = :'m1') = 7000, '3 s + 4 s');
select t.ok((select start_ms from public.clips where moment_id = :'m2') = 292000, '8 s before');
select t.ok((select end_ms from public.clips where moment_id = :'m2') = 304000, '4 s after');
select t.ok((select end_ms from public.clips where moment_id = :'m3') = 599000 or (select end_ms from public.clips where moment_id = :'m3') = 600000, 'end clamped to duration');
select t.ok((select count(*) from public.plan_clips(:'vid')) = 0, 'planning is idempotent');
select t.ok((select count(*) from public.clips where video_id = :'vid') = 4, 'no duplicate clips');
select t.ok((select bool_and(status = 'queued' and visibility = 'match' and format = '9:16') from public.clips), 'clips start queued, match-only, 9:16');

-- ============================================================ clip access
set role authenticated;
select t.act_as(t.uid(23));
select t.ok((select count(*) from public.clips) = 4, 'participants see the clips');
select t.throws('select attempts from public.clips', '42501');     -- worker bookkeeping is not client-readable
select t.act_as(t.uid(25));
select t.ok((select count(*) from public.clips) = 0, 'outsiders see no match-only clips');

-- ============================================================ visibility and consent
select t.act_as(t.uid(24));
select t.throws(format('select public.set_clip_visibility(%L, %L)', (select id from public.clips where moment_id = :'m1'), 'public'), '42501');  -- 24 is neither filmer nor subject of m1
select t.act_as(t.uid(22));
select t.throws(format('select public.set_clip_visibility(%L, %L)', (select id from public.clips where moment_id = :'m1'), 'public'), '22023');  -- 24 refused filming
reset role;
update public.match_participants set image_consent = true where match_id = :'pid' and user_id = t.uid(24);
set role authenticated;
select t.act_as(t.uid(22));
select public.set_clip_visibility((select id from public.clips where moment_id = :'m1'), 'public');
select t.act_as(t.uid(25));
select t.ok((select count(*) from public.clips) = 1, 'outsider sees only the public clip');

-- a minor on the pitch blocks public sharing
select t.act_as(t.uid(21));
select public.create_match('padel', 'double', now() + interval '1 day', null, 'Agdal Padel', 'Casablanca', 'Maârif', 'any', true) as qid \gset
select t.act_as(t.uid(22)); select public.join_match(:'qid', true);
select t.act_as(t.uid(23)); select public.join_match(:'qid', true);
select t.act_as(t.uid(26)); select public.join_match(:'qid', true);
reset role;
update public.matches set starts_at = now() - interval '5 minutes' where id = :'qid';
set role authenticated;
select t.act_as(t.uid(21));
select public.start_recording(:'qid') as qvid \gset
select public.mark_moment(:'qid', 'smash') as qm \gset
select public.stop_recording(:'qvid', 120);
select public.finish_upload(:'qvid');
reset role;
select count(*) as planned from public.plan_clips(:'qvid') \gset
select t.ok(:planned = 1, 'clip planned for match Q');
set role authenticated;
select t.act_as(t.uid(21));
select t.throws(format('select public.set_clip_visibility(%L, %L)', (select id from public.clips where video_id = :'qvid'), 'public'), '22023');

-- ============================================================ upload URL privacy, push tokens, anon
reset role;
insert into public.video_uploads (video_id, upload_url) values (:'qvid', 'https://upload.example/abc');
set role authenticated;
select t.act_as(t.uid(21));
select t.ok((select count(*) from public.video_uploads) = 1, 'filmer reads own upload URL');
select t.act_as(t.uid(22));
select t.ok((select count(*) from public.video_uploads) = 0, 'other players cannot read it');
insert into public.push_tokens (user_id, token) values (t.uid(22), 'ExponentPushToken[abc]');
select t.throws(format('insert into public.push_tokens (user_id, token) values (%L, %L)', t.uid(21), 'x'), '42501');
reset role;
set role anon;
select t.throws('select * from public.clips', '42501');
select t.throws(format('select public.mark_moment(%L, %L)', :'pid', 'smash'), '42501');
reset role;

-- ============================================================ worker queue
-- originals that are not ready yet are not claimed
select t.ok((select count(*) from public.claim_clips(10)) = 0, 'nothing claimed while the original is still processing');
update public.videos set status = 'ready', provider = 'cloudflare', provider_asset_id = 'orig-P' where id = :'vid';
select t.ok((select count(*) from public.claim_clips(2)) = 2, 'claims at most the requested number of clips');
select t.ok((select count(*) from public.clips where status = 'processing') = 2, 'claimed clips are processing');
select t.ok((select count(*) from public.claim_clips(10)) = 2, 'next claim takes the remaining 2');
select t.ok((select count(*) from public.claim_clips(10)) = 0, 'no double claim');
update public.clips set created_at = now() - interval '1 hour' where status = 'processing';
select t.ok(public.requeue_stuck_clips() = 4, 'stuck clips return to the queue');
update public.clips set attempts = 3 where moment_id = :'m1';
select t.ok((select count(*) from public.claim_clips(10)) = 3, 'a clip with 3 attempts is not retried');
select t.ok((select status from public.clips where moment_id = :'m1') = 'failed', 'and is marked failed');
update public.clips set status = 'ready', ready_at = now(), storage_path = 'clips/' || id || '.mp4' where status = 'processing';

-- storage policy: participants and public clips only
update public.clips set visibility = 'public' where moment_id = :'m2';
insert into storage.objects (bucket_id, name) select 'clips', storage_path from public.clips where storage_path is not null;
set role authenticated;
select t.act_as(t.uid(23));
select t.ok((select count(*) from storage.objects) = 3, 'participant can read the 3 clip files');
select t.act_as(t.uid(25));
select t.ok((select count(*) from storage.objects) = 1, 'outsider only reads the public clip file');
reset role;

-- ============================================================ 30-day expiry of originals
update public.videos set original_expires_at = now() - interval '1 day' where id = :'vid';
update public.clips set storage_path = 'clips/m2.mp4' where moment_id = :'m2';
select t.ok((select original_expires_at from public.videos where id = :'qvid') > now() + interval '29 days', 'new originals expire in 30 days');
select t.ok(public.expire_originals() = 1, 'one original expired');
select t.ok((select status from public.videos where id = :'vid') = 'expired', 'original marked expired');
select t.ok((select count(*) from public.provider_deletions where asset_id = 'orig-P') = 1, 'original queued for provider deletion');
select t.ok((select count(*) from public.clips where video_id = :'vid') = 4, 'clips survive original expiry');
select t.ok(public.expire_originals() = 0, 'expiry is idempotent');

-- ============================================================ account deletion erases the filmer's footage
delete from auth.users where id = t.uid(22);
select t.ok((select count(*) from public.videos where id = :'vid') = 0, 'filmer video erased with the account');
select t.ok((select count(*) from public.moments where video_id = :'vid') = 0, 'moments erased with the video');
select t.ok((select count(*) from public.provider_deletions where asset_id = 'clips/m2.mp4' and provider = 'supabase-storage') = 1, 'stored clip file queued for deletion');
select t.ok((select count(*) from public.push_tokens where user_id = t.uid(22)) = 0, 'push tokens erased');

-- ============================================================ imported footage: mark while scrubbing
select t.act_as(t.uid(21));
select count(*) as nlist from public.my_matches_for_filming() \gset
select t.ok(:nlist >= 1, 'filming list includes my recent matches');
reset role;
set role authenticated;
select t.act_as(t.uid(21));
select public.create_match('foot', '5v5', now() + interval '1 day', null, 'Five Oasis', 'Casablanca', 'Maârif', 'any', true) as fid \gset
reset role;
update public.matches set starts_at = now() - interval '2 hours' where id = :'fid';
set role authenticated;
select t.act_as(t.uid(21));
select public.start_recording(:'fid', 'import', now() - interval '2 hours') as ivid \gset
select t.throws(format('select public.add_moment_at(%L, %L, null, 5000)', :'ivid', 'goal'), '22023');      -- duration unknown yet
select public.set_video_duration(:'ivid', 3000);
select public.add_moment_at(:'ivid', 'goal', null, 125000);
select t.throws(format('select public.add_moment_at(%L, %L, null, 3000000)', :'ivid', 'goal'), '22023');   -- beyond the footage
select t.throws(format('select public.add_moment_at(%L, %L, null, 5000)', :'ivid', 'smash'), '22023');     -- padel move in foot
select t.act_as(t.uid(23));
select t.throws(format('select public.add_moment_at(%L, %L, null, 5000)', :'ivid', 'goal'), '42501');      -- not the author
select t.act_as(t.uid(21));
select public.finish_upload(:'ivid');
select t.throws(format('select public.add_moment_at(%L, %L, null, 9000)', :'ivid', 'goal'), '22023');      -- too late once sent
reset role;
select t.ok((select count(*) from public.plan_clips(:'ivid')) = 1, 'imported video yields a clip');
select t.ok((select start_ms from public.clips where video_id = :'ivid') = 117000, '8 s before the marked second');
