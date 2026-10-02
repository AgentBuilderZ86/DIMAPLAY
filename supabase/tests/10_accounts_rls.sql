insert into auth.users (id, phone) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '+212600000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '+212600000002'),
  ('cccccccc-0000-0000-0000-000000000003', '+212600000003');

-- 1. signup creates an empty profile
select t.ok((select count(*) from public.profiles) = 3, 'profile row created per auth user');

-- as user A
set role authenticated;
select t.act_as('aaaaaaaa-0000-0000-0000-000000000001');

-- 2. isolation
select t.ok((select count(*) from public.profiles) = 1, 'A sees only own profile');
select t.ok((select count(*) from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0, 'A cannot read B');
select t.ok((select count(*) from public.consents) = 0, 'no consents yet');

-- 3. column-level update rules
update public.profiles set display_name = 'Mehdi A.', handle = 'mehdi.a', city = 'Casablanca',
  neighborhood = 'Maârif', sports = '{foot,padel}', birth_year = 1990, language = 'fr'
 where id = auth.uid();
select t.ok((select display_name from public.profiles where id = auth.uid()) = 'Mehdi A.', 'A updates own profile');
select t.ok((select is_minor from public.profiles where id = auth.uid()) = false, 'adult not flagged minor');

do $$ begin
  update public.profiles set is_minor = true where id = auth.uid();
  raise exception 'ASSERT FAILED: is_minor must not be client-writable';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.profiles set onboarding_completed_at = now() where id = auth.uid();
  raise exception 'ASSERT FAILED: onboarding_completed_at must not be client-writable';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.profiles set parental_consent_at = now() where id = auth.uid();
  raise exception 'ASSERT FAILED: parental_consent_at must not be client-writable';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.profiles set birth_year = 2010 where id = auth.uid();
  raise exception 'ASSERT FAILED: birth_year must be immutable once set';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.profiles set handle = 'x' where id = auth.uid();
  raise exception 'ASSERT FAILED: handle check';
exception when check_violation then null; end $$;
-- updating someone else's row silently affects 0 rows
update public.profiles set display_name = 'hacked' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
reset role;
select t.ok((select display_name from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002') is null, 'B untouched by A');
set role authenticated;
select t.act_as('aaaaaaaa-0000-0000-0000-000000000001');

-- 4. onboarding requires consents
do $$ begin
  perform public.complete_onboarding();
  raise exception 'ASSERT FAILED: onboarding must need consents';
exception when invalid_parameter_value then null; end $$;

-- 5. consents: own only, append-only, never parental
insert into public.consents (user_id, kind, version, granted) values (auth.uid(), 'terms', '2026-10', true);
do $$ begin
  insert into public.consents (user_id, kind, version, granted)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'terms', '2026-10', true);
  raise exception 'ASSERT FAILED: cannot insert consent for another user';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.consents (user_id, kind, version, granted) values (auth.uid(), 'parental', '1', true);
  raise exception 'ASSERT FAILED: client cannot self-grant parental consent';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.consents set granted = false;
  raise exception 'ASSERT FAILED: consents are append-only (update)';
exception when insufficient_privilege then null; end $$;
do $$ begin
  delete from public.consents;
  raise exception 'ASSERT FAILED: consents are append-only (delete)';
exception when insufficient_privilege then null; end $$;
-- still missing privacy
do $$ begin
  perform public.complete_onboarding();
  raise exception 'ASSERT FAILED: privacy consent also required';
exception when invalid_parameter_value then null; end $$;
insert into public.consents (user_id, kind, version, granted) values (auth.uid(), 'privacy', '2026-10', true);
select public.complete_onboarding();
select t.ok((select onboarding_completed_at from public.profiles where id = auth.uid()) is not null, 'onboarding completed');

-- revocation: latest decision wins
insert into public.consents (user_id, kind, version, granted) values (auth.uid(), 'privacy', '2026-10', false);
select t.ok(public.has_consent('privacy') = false, 'revoked consent is honoured');
insert into public.consents (user_id, kind, version, granted) values (auth.uid(), 'privacy', '2026-10', true);

-- 6. minor handling (user C)
select t.act_as('cccccccc-0000-0000-0000-000000000003');
update public.profiles set display_name = 'Kid C', city = 'Rabat', neighborhood = 'Agdal',
  sports = '{foot}', birth_year = (extract(year from now())::int - 15)::smallint, recruiter_visible = true
 where id = auth.uid();
select t.ok((select is_minor from public.profiles where id = auth.uid()), 'minor flagged from birth year');
select t.ok((select recruiter_visible from public.profiles where id = auth.uid()) = false, 'minor forced out of recruiter showcase');
insert into public.consents (user_id, kind, version, granted) values
  (auth.uid(), 'terms', '2026-10', true), (auth.uid(), 'privacy', '2026-10', true);
select public.complete_onboarding();

-- 7. public view: adults only, completed only
select t.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select t.ok((select count(*) from public.public_profiles) = 1, 'B sees only the completed adult A');
select t.ok((select count(*) from public.public_profiles where id = 'cccccccc-0000-0000-0000-000000000003') = 0, 'minor never public');
select t.ok((select count(*) from public.public_profiles where id = auth.uid()) = 0, 'incomplete profile not public');
do $$ begin
  perform birth_year from public.public_profiles;
  raise exception 'ASSERT FAILED: birth_year must not be exposed';
exception when undefined_column then null; end $$;

-- 8. anon has no access
reset role;
set role anon;
do $$ begin
  perform 1 from public.profiles;
  raise exception 'ASSERT FAILED: anon must not read profiles';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform 1 from public.public_profiles;
  raise exception 'ASSERT FAILED: anon must not read public_profiles';
exception when insufficient_privilege then null; end $$;
reset role;

-- 9. account deletion cascades
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select t.ok((select count(*) from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'profile erased with account');
select t.ok((select count(*) from public.consents where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'consents erased with account');
