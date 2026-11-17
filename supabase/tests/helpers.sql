-- Assertions and identities shared by the *.test.sql files. Each assertion
-- raises 'not ok - <msg>' on failure and notices 'ok - <msg>' on success.

create extension if not exists dblink;
create schema test;
grant usage on schema test to anon, authenticated, service_role;

create function test.ok(p_cond boolean, p_msg text) returns void
language plpgsql as $$
begin
  if p_cond is not true then raise exception 'not ok - %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end;
$$;

create function test.eq(p_got anyelement, p_want anyelement, p_msg text) returns void
language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'not ok - %: got %, want %', p_msg, p_got, p_want;
  end if;
  raise notice 'ok - %', p_msg;
end;
$$;

-- Runs p_sql as the current role and expects it to fail with p_state.
create function test.throws(p_sql text, p_state text, p_msg text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then
      raise notice 'ok - %', p_msg;
      return;
    end if;
    raise exception 'not ok - %: expected % but got % (%)', p_msg, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'not ok - %: expected % but it succeeded', p_msg, p_state;
end;
$$;

-- Acts as a signed-in user for the rest of the current transaction, as
-- PostgREST does: role authenticated plus request.jwt.claims.
create function test.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function test.id(p_name text) returns uuid
language sql immutable as $$
  select private.uuid_for('test:' || p_name)
$$;

create function test.user(p_name text) returns uuid
language sql as $$
  insert into auth.users (id, email) values (test.id('user:' || p_name), p_name || '@test.local')
  on conflict (id) do nothing;
  select test.id('user:' || p_name)
$$;

-- A household with p_owner as its admin, created the way Nitro does.
create function test.household(p_owner uuid, p_name text) returns uuid
language sql as $$
  select (public.move_household(test.id('create:' || p_name), p_owner, 'create',
                                jsonb_build_object('name', p_name)) ->> 'household_id')::uuid
$$;

create function test.cmd(p_kind text, p_household uuid, p_item uuid, p_extra jsonb default '{}',
                         p_id uuid default gen_random_uuid())
returns jsonb
language sql as $$
  select jsonb_build_object('id', p_id, 'kind', p_kind, 'household_id', p_household,
                            'item_id', p_item, 'at', now()) || p_extra
$$;

-- Applies commands as p_user in one transaction and returns the RPC response.
create function test.apply(p_user uuid, p_commands jsonb) returns jsonb
language plpgsql as $$
declare
  v_out jsonb;
begin
  perform test.act_as(p_user);
  v_out := public.apply_commands(p_commands);
  perform set_config('role', 'postgres', true);
  return v_out;
end;
$$;

create function test.result(p_response jsonb, p_index integer default 0) returns text
language sql immutable as $$
  select coalesce(p_response -> 'results' -> p_index ->> 'reason',
                  p_response -> 'results' -> p_index ->> 'status')
$$;

-- Creates an item with opening stock as p_user and returns its id.
create function test.item(p_user uuid, p_household uuid, p_name text, p_amount numeric default 0,
                          p_to_buy numeric default 0, p_best_before date default null)
returns uuid
language plpgsql as $$
declare
  v_id uuid := test.id('item:' || p_household || ':' || p_name);
  v_res text;
begin
  v_res := test.result(test.apply(p_user, jsonb_build_array(test.cmd('create', p_household, v_id, jsonb_build_object(
    'item', jsonb_build_object('name', p_name, 'aliases', '[]'::jsonb, 'tags', '[]'::jsonb,
                               'unit', 'count', 'default_amount', 1, 'shelf_life_days', null),
    'start', jsonb_build_object('amount', p_amount, 'to_buy', p_to_buy, 'best_before', p_best_before))))));
  if v_res <> 'accepted' then raise exception 'test.item % was %', p_name, v_res; end if;
  return v_id;
end;
$$;

create function test.stock(p_item uuid) returns jsonb
language sql as $$
  select jsonb_build_object('amount', amount, 'to_buy', to_buy, 'best_before', best_before)
    from public.items_v2 where id = p_item
$$;

-- A share token as share.post mints it: only the sha256 of the token is stored.
create function test.share(p_household uuid, p_owner uuid, p_token text,
                           p_expires timestamptz default now() + interval '1 day')
returns void
language sql as $$
  insert into public.household_share_tokens (token_hash, household_id, created_by, expires_at)
  values (encode(sha256(convert_to(p_token, 'UTF8')), 'hex'), p_household, p_owner, p_expires)
$$;
