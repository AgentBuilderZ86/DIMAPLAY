-- RLS and behaviour tests for M1 accounts. Each assertion raises on failure.
create schema if not exists t;
grant usage on schema t to public;
create or replace function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'ASSERT FAILED: %', msg; end if;
end $$;
grant execute on function t.ok(boolean, text) to public;
create or replace function t.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
end $$;
grant execute on function t.act_as(uuid) to public;


create or replace function t.throws(q text, code text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'ASSERT FAILED: expected % from: %', code, q;
exception when others then
  if sqlstate = 'P0001' and sqlerrm like 'ASSERT FAILED%' then raise; end if;
  if sqlstate <> code then
    raise exception 'ASSERT FAILED: expected % got % (%) from: %', code, sqlstate, sqlerrm, q;
  end if;
end $$;
grant execute on function t.throws(text, text) to public;

-- Creates an onboarded adult (or minor) test user with a deterministic id.
create or replace function t.mkuser(n int, p_hood text default 'Maârif', p_city text default 'Casablanca', p_birth smallint default 1990)
returns uuid language plpgsql as $$
declare uid uuid := ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid;
begin
  insert into auth.users (id, phone) values (uid, '+2126' || lpad(n::text, 8, '0'));
  update public.profiles set display_name = 'Player ' || n, city = p_city, neighborhood = p_hood,
         sports = '{foot,padel,tennis}', birth_year = p_birth, onboarding_completed_at = now()
   where id = uid;
  return uid;
end $$;
create or replace function t.uid(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;
grant execute on function t.uid(int) to public;
