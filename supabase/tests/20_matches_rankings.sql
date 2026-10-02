-- M2 acceptance: full 10-player match updates Elo and rankings; contested scores are not counted.

-- Players 1-5 Maârif, 6-9 Agdal (Casablanca), 10 is a minor, 11 plays in Rabat, 12 is a moderator,
-- 13 never finished onboarding.
select t.mkuser(n, case when n <= 5 then 'Maârif' else 'Agdal' end) from generate_series(1, 9) n;
select t.mkuser(10, 'Maârif', 'Casablanca', (extract(year from now())::int - 15)::smallint);
select t.mkuser(11, 'Agdal', 'Rabat');
select t.mkuser(12);
insert into public.moderators (user_id) values (t.uid(12));
insert into auth.users (id, phone) values (t.uid(13), '+212600000013');
insert into public.clubs (name, city, neighborhood, sports) values ('Five Oasis', 'Casablanca', 'Maârif', '{foot}');

set role authenticated;

-- ============================================================ creation rules
select t.act_as(t.uid(13));
select t.throws($q$select public.create_match('foot','5v5', now() + interval '1 day', null, 'Five Oasis', 'Casablanca', 'Maârif')$q$, '42501');

select t.act_as(t.uid(1));
select t.throws($q$select public.create_match('foot','double', now() + interval '1 day', null, 'Five Oasis', 'Casablanca', 'Maârif')$q$, '22023');
select t.throws($q$select public.create_match('foot','5v5', now() - interval '1 hour', null, 'Five Oasis', 'Casablanca', 'Maârif')$q$, '22023');
select t.throws($q$insert into public.matches (sport, venue, city, starts_at, format, capacity) values ('foot','x1','Casablanca', now(), '5v5', 10)$q$, '42501');

select public.create_match('foot', '5v5', now() + interval '1 day', null, 'Five Oasis', 'Casablanca', 'Maârif', 'any', true) as mid \gset

-- ============================================================ joining
select t.act_as(t.uid(2));
select public.join_match(:'mid', false);
select t.throws(format('select public.join_match(%L)', :'mid'), '23505');
select t.act_as(t.uid(3)); select public.join_match(:'mid', true);
select t.act_as(t.uid(4)); select public.join_match(:'mid');
select t.act_as(t.uid(5)); select public.join_match(:'mid');
select t.act_as(t.uid(6)); select public.join_match(:'mid');
select t.act_as(t.uid(7)); select public.join_match(:'mid');
select t.act_as(t.uid(8)); select public.join_match(:'mid');
select t.act_as(t.uid(9)); select public.join_match(:'mid');
select t.act_as(t.uid(10)); select public.join_match(:'mid');
select t.act_as(t.uid(11));
select t.throws(format('select public.join_match(%L)', :'mid'), '22023');  -- full

-- outsiders see the listing but not the roster, and cannot read participants/results directly
select t.ok((select joined_count from public.list_open_matches('foot') where id = :'mid') = 10, 'listing shows 10/10');
select t.ok((select not joined from public.list_open_matches('foot') where id = :'mid'), 'outsider is not joined');
select t.ok((select count(*) from public.get_match_participants(:'mid')) = 0, 'outsider gets no roster');
select t.ok(public.match_joined_count(:'mid') = 10, 'outsider can still see how many spots are taken');
select t.ok((select count(*) from public.match_participants where match_id = :'mid') = 0, 'RLS hides participants from outsiders');
select t.throws(format('update public.matches set status = %L', 'finished'), '42501');

-- per-match image consent is logged
reset role;
select t.ok((select count(*) from public.consents where match_id = :'mid' and kind = 'image') = 10, 'image consent logged per player');
select t.ok((select granted from public.consents where match_id = :'mid' and user_id = t.uid(3)), 'player 3 consented');
select t.ok(not (select granted from public.consents where match_id = :'mid' and user_id = t.uid(2)), 'player 2 refused');
set role authenticated;

-- ============================================================ teams
select t.act_as(t.uid(2));
select t.throws(format('select public.auto_balance_teams(%L)', :'mid'), '42501');
select t.throws(format('select public.assign_team(%L, %L, %L)', :'mid', t.uid(2), 'A'), '42501');

select t.act_as(t.uid(1));
select public.auto_balance_teams(:'mid');
select t.ok((select count(*) from public.match_participants where match_id = :'mid' and team = 'A') = 5, '5 in team A');
select t.ok((select count(*) from public.match_participants where match_id = :'mid' and team = 'B') = 5, '5 in team B');

-- results cannot be submitted before kick-off
select t.throws(format('select public.submit_result(%L, 5, 3)', :'mid'), '22023');
reset role;
update public.matches set starts_at = now() - interval '2 hours' where id = :'mid';
select t.ok((select string_agg(user_id::text, ',') from public.match_participants where match_id = :'mid' and team = 'A' and user_id = t.uid(1)) is not null
         or true, 'noop');
select (select user_id from public.match_participants where match_id = :'mid' and team = 'A' order by user_id limit 1) as a_player \gset
select (select user_id from public.match_participants where match_id = :'mid' and team = 'A' order by user_id desc limit 1) as a_player2 \gset
select (select user_id from public.match_participants where match_id = :'mid' and team = 'B' order by user_id limit 1) as b_player \gset
select (select user_id from public.match_participants where match_id = :'mid' and team = 'B' order by user_id desc limit 1) as b_player2 \gset
set role authenticated;

-- an outsider cannot submit; the creator cannot rewrite after the fact
select t.act_as(t.uid(11));
select t.throws(format('select public.submit_result(%L, 5, 3)', :'mid'), '42501');

-- ============================================================ submit / confirm
select t.act_as(:'a_player');
select public.submit_result(:'mid', 5, 3);
select t.throws(format('select public.submit_result(%L, 1, 0)', :'mid'), '23505');       -- one result per match
select t.throws(format('select public.confirm_result(%L)', :'mid'), '42501');           -- same team cannot confirm
select t.act_as(:'a_player2');
select t.throws(format('select public.confirm_result(%L)', :'mid'), '42501');
reset role;
select t.ok((select count(*) from public.ratings) = 0, 'pending result counts for nothing');
set role authenticated;

select t.act_as(:'b_player');
select public.confirm_result(:'mid');
select t.throws(format('select public.confirm_result(%L)', :'mid'), '22023');           -- already confirmed

reset role;
-- 10 players, K=40 (calibrating), equal ratings, goal diff 2 => bonus 1.1 : winners +22.00, losers -22.00
select t.ok((select count(*) from public.ratings where sport = 'foot') = 10, 'ratings created for all 10');
select t.ok((select bool_and(elo = 1022.00 and matches_count = 1) from public.ratings r join public.match_participants mp
              on mp.user_id = r.user_id and mp.match_id = :'mid' where mp.team = 'A'), 'team A +22');
select t.ok((select bool_and(elo = 978.00 and matches_count = 1) from public.ratings r join public.match_participants mp
              on mp.user_id = r.user_id and mp.match_id = :'mid' where mp.team = 'B'), 'team B -22');
select t.ok((select count(*) from public.rating_history where match_id = :'mid') = 10, '10 history rows');
select t.ok((select status from public.matches where id = :'mid') = 'finished', 'match finished');
select t.ok((select sum(delta) from public.rating_history where match_id = :'mid') = 0, 'zero-sum between equal teams');

-- ============================================================ rankings
select public.refresh_rankings();
set role authenticated;
select t.act_as(t.uid(1));
select t.ok((select count(*) from public.get_ranking('foot', 'morocco')) = 9, 'minor excluded from public ranking (9 of 10)');
select t.ok((select count(*) from public.get_ranking('foot', 'morocco') where user_id = t.uid(10)) = 0, 'minor never listed');
select t.ok((select elo from public.get_ranking('foot', 'morocco') where pos = 1) in (1022.00), 'leader has 1022');
select t.ok((select bool_and(calibrating) from public.get_ranking('foot', 'morocco')), 'all calibrating after 1 match');
select t.ok((select bool_and(neighborhood = 'Maârif') from public.get_ranking('foot', 'neighborhood')), 'neighbourhood scope follows caller');
select t.ok((select count(*) from public.get_ranking('foot', 'city')) = 9, 'city scope = Casablanca players');
select t.ok((select count(*) from public.get_ranking('foot', 'morocco') where is_me) = 1, 'caller flagged');
select t.ok((select count(*) from public.get_ranking('padel', 'morocco')) = 0, 'no padel ranking yet');
select t.throws($q$select * from public.get_ranking('foot', 'planet')$q$, '22023');
select t.throws($q$select * from public.ranking_base$q$, '42501');                       -- matview not exposed

-- the minor still sees their own rating, without public ranks
select t.act_as(t.uid(10));
select t.ok((select elo is not null and rank_morocco is null from public.get_my_standing('foot')), 'minor sees own elo but no rank');
select t.ok((select calibrating from public.get_my_standing('foot')), 'standing flags calibration');

-- 7-day change: a snapshot from 8 days ago in a worse spot shows as a positive move
reset role;
insert into public.ranking_snapshots (taken_on, sport, user_id, rank_morocco, rank_city, rank_neighborhood)
select current_date - 8, 'foot', user_id, 9, 9, 9 from public.ranking_base where rank_morocco = 1;
set role authenticated;
select t.act_as(t.uid(1));
select t.ok((select change7d from public.get_ranking('foot', 'morocco') where pos = 1) = 8, 'moved up 8 places in 7+ days');

-- ============================================================ contested result is not counted
select t.act_as(t.uid(1));
select public.create_match('padel', 'double', now() + interval '1 day', null, 'Padel Corniche', 'Casablanca', 'Maârif') as pid \gset
select t.act_as(t.uid(2)); select public.join_match(:'pid');
select t.act_as(t.uid(3)); select public.join_match(:'pid');
select t.act_as(t.uid(4)); select public.join_match(:'pid');
select t.act_as(t.uid(1));
select public.assign_team(:'pid', t.uid(2), 'A');
select t.throws(format('select public.assign_team(%L, %L, %L)', :'pid', t.uid(3), 'A'), '22023');   -- team full (creator + 2)
select public.assign_team(:'pid', t.uid(3), 'B');
select public.assign_team(:'pid', t.uid(4), 'B');
reset role;
update public.matches set starts_at = now() - interval '3 hours' where id = :'pid';
set role authenticated;
select t.act_as(t.uid(1));
select t.throws(format('select public.submit_result(%L, 6, 6)', :'pid'), '22023');   -- no draws in padel
select public.submit_result(:'pid', 6, 4, '{"sets":[[6,4]]}');
select t.act_as(t.uid(3));
select public.contest_result(:'pid');
select t.throws(format('select public.confirm_result(%L)', :'pid'), '22023');         -- contested cannot be confirmed
reset role;
select t.ok((select status from public.match_results where match_id = :'pid') = 'contested', 'result contested');
select t.ok((select count(*) from public.ratings where sport = 'padel') = 0, 'contested result is NOT counted');
select t.ok((select status from public.matches where id = :'pid') = 'open', 'match stays open while contested');
set role authenticated;

-- only moderators can arbitrate
select t.act_as(t.uid(1));
select t.throws(format('select public.arbitrate_result(%L, 6, 4)', :'pid'), '42501');
select t.act_as(t.uid(12));
select public.arbitrate_result(:'pid', 4, 6);
reset role;
select t.ok((select status from public.match_results where match_id = :'pid') = 'arbitrated', 'arbitrated');
select t.ok((select count(*) from public.ratings where sport = 'padel') = 4, 'arbitrated result counted for 4 players');
select t.ok((select elo from public.ratings where user_id = t.uid(3) and sport = 'padel') = 1020.00, 'team B wins, +20 (no goal bonus in padel)');
select t.ok((select elo from public.ratings where user_id = t.uid(1) and sport = 'padel') = 980.00, 'team A loses, -20');
set role authenticated;

-- ============================================================ leave / cancel
select t.act_as(t.uid(1));
select public.create_match('tennis', 'simple', now() + interval '2 days', null, 'Club Palmeraie', 'Casablanca', null) as tid \gset
select t.act_as(t.uid(2)); select public.join_match(:'tid');
select public.leave_match(:'tid');
select t.ok((select count(*) from public.list_open_matches('tennis') where id = :'tid' and joined_count = 1) = 1, 'leaver removed');
select t.act_as(t.uid(1));
select t.throws(format('select public.leave_match(%L)', :'tid'), '22023');            -- creator must cancel
select t.act_as(t.uid(2));
select t.throws(format('select public.cancel_match(%L)', :'tid'), '42501');            -- non-creator cannot cancel
select t.act_as(t.uid(1));
select public.cancel_match(:'tid');
select t.ok((select count(*) from public.list_open_matches('tennis') where id = :'tid') = 0, 'cancelled match not listed');
select t.act_as(t.uid(2));
select t.throws(format('select public.join_match(%L)', :'tid'), '22023');

-- ============================================================ anon and deletion
reset role;
set role anon;
select t.throws($q$select * from public.list_open_matches()$q$, '42501');
select t.throws($q$select * from public.matches$q$, '42501');
reset role;

-- deleting an account keeps other players' results and Elo intact
select elo as before_elo from public.ratings where user_id = t.uid(2) and sport = 'foot' \gset
delete from auth.users where id = t.uid(5);
select t.ok((select count(*) from public.matches where id = :'mid') = 1, 'match survives account deletion');
select t.ok((select count(*) from public.match_participants where match_id = :'mid') = 9, 'only the deleted participant removed');
select t.ok((select elo from public.ratings where user_id = t.uid(2) and sport = 'foot') = :before_elo, 'other ratings unchanged');
select t.ok((select count(*) from public.ratings where user_id = t.uid(5)) = 0, 'deleted player rating erased');
