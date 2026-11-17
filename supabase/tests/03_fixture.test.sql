-- Replays tests/fixtures/commands.json, the cases utils/pantry/reduce.ts is
-- tested against, through apply_commands. Each case gets its own household,
-- actor and ids (fixture names map to uuid_for('fixture:<case>:<name>')).
-- Every disagreement across all cases is listed before the file fails.

\set fixture `cat /repo/tests/fixtures/commands.json`
set fixture.doc to :'fixture';

create function test.fx(p_case integer, p_name text) returns uuid
language sql immutable as $$
  select private.uuid_for('fixture:' || p_case || ':' || p_name)
$$;

create function test.fx_case(p_no integer, p_case jsonb, p_defaults jsonb) returns text[]
language plpgsql as $$
declare
  v_actor    uuid := test.user('fixture' || p_no);
  v_names    jsonb;
  v_item     jsonb;
  v_bag      jsonb;
  v_cmd      jsonb;
  v_cmds     jsonb := '[]';
  v_response jsonb;
  v_expect   jsonb := p_case -> 'expect';
  v_key      text;
  v_field    text;
  v_want     jsonb;
  v_got      jsonb;
  v_row      jsonb;
  v_bad      text[] := '{}';
begin
  -- uuid -> fixture name, for every string the case mentions.
  select jsonb_object_agg(test.fx(p_no, s), s) into v_names
    from (select jsonb_path_query(p_case, '$.** ? (@.type() == "string")') #>> '{}' as s
          union select jsonb_object_keys(coalesce(v_expect -> 'items', '{}'))
          union select jsonb_object_keys(coalesce(v_expect -> 'bag', '{}'))
          union select 'h1' union select 'h2') names;

  insert into public.households (id, name) values (test.fx(p_no, 'h1'), 'h1'), (test.fx(p_no, 'h2'), 'h2');
  insert into public.household_members (id, household_id, user_id, email, role)
  values (gen_random_uuid(), test.fx(p_no, 'h1'), v_actor, 'fixture' || p_no || '@test.local', 'admin');

  for v_item in select p_defaults -> 'item' || value from jsonb_array_elements(p_case #> '{initial,items}') loop
    insert into public.items_v2 (id, household_id, name, aliases, tags, unit, default_amount,
                                 shelf_life_days, amount, to_buy, best_before, deleted_at)
    values (test.fx(p_no, v_item ->> 'id'), test.fx(p_no, v_item ->> 'household_id'), v_item ->> 'name',
            array(select jsonb_array_elements_text(v_item -> 'aliases')), v_item -> 'tags',
            v_item ->> 'unit', (v_item ->> 'default_amount')::numeric,
            (v_item ->> 'shelf_life_days')::integer, (v_item ->> 'amount')::numeric,
            (v_item ->> 'to_buy')::numeric, (v_item ->> 'best_before')::date,
            (v_item ->> 'deleted_at')::timestamptz);
  end loop;
  update public.items_v2 i set merged_into = test.fx(p_no, x.value ->> 'merged_into')
    from jsonb_array_elements(p_case #> '{initial,items}') x
   where i.id = test.fx(p_no, x.value ->> 'id') and x.value ->> 'merged_into' is not null;

  for v_bag in select p_defaults -> 'bag_entry' || value from jsonb_array_elements(p_case #> '{initial,bag}') loop
    if v_bag ->> 'state' <> 'open' then raise exception 'fixture % seeds a closed bag entry', p_no; end if;
    insert into public.item_events (id, household_id, item_id, kind, qty, occurred_at, origin)
    values (test.fx(p_no, v_bag ->> 'purchase_event'), test.fx(p_no, v_bag ->> 'household_id'),
            test.fx(p_no, v_bag ->> 'item_id'), 'purchase', (v_bag ->> 'qty')::numeric,
            (v_bag ->> 'bought_at')::timestamptz, 'import');
    insert into public.bag_entries (id, household_id, item_id, qty, from_list, state, bought_at, purchase_event)
    values (test.fx(p_no, v_bag ->> 'id'), test.fx(p_no, v_bag ->> 'household_id'),
            test.fx(p_no, v_bag ->> 'item_id'), (v_bag ->> 'qty')::numeric,
            (v_bag ->> 'from_list')::numeric, 'open', (v_bag ->> 'bought_at')::timestamptz,
            test.fx(p_no, v_bag ->> 'purchase_event'));
  end loop;

  -- A receipt means the server already applied that command into `initial`.
  insert into public.command_log (command_id, household_id, kind, actor, item_ids, at)
  select test.fx(p_no, r #>> '{}'), test.fx(p_no, 'h1'), c ->> 'kind', v_actor,
         array[test.fx(p_no, c ->> 'item_id')], (p_defaults #>> '{command,at}')::timestamptz
    from jsonb_array_elements(coalesce(p_case -> 'receipts', '[]')) r
    join lateral (select value as c from jsonb_array_elements(p_case -> 'commands')
                   where value ->> 'id' = r #>> '{}' limit 1) cmd on true;

  for v_cmd in select p_defaults -> 'command' || value from jsonb_array_elements(p_case -> 'commands') loop
    foreach v_key in array array['id', 'household_id', 'item_id', 'bag_id', 'target', 'into'] loop
      if v_cmd ? v_key then
        v_cmd := v_cmd || jsonb_build_object(v_key, test.fx(p_no, v_cmd ->> v_key));
      end if;
    end loop;
    v_cmds := v_cmds || jsonb_build_array(v_cmd);
  end loop;

  v_response := test.apply(v_actor, v_cmds);

  for v_key, v_want in select key, value from jsonb_each(coalesce(v_expect -> 'items', '{}')) loop
    select to_jsonb(i) into v_row from public.items_v2 i where i.id = test.fx(p_no, v_key);
    for v_field in select jsonb_object_keys(v_want) loop
      v_got := case when v_field = 'merged_into' then coalesce(v_names -> (v_row ->> v_field), v_row -> v_field)
                    else v_row -> v_field end;
      if v_got is distinct from v_want -> v_field then
        v_bad := v_bad || format('items.%s.%s: got %s, want %s', v_key, v_field, v_got, v_want -> v_field);
      end if;
    end loop;
  end loop;

  for v_key, v_want in select key, value from jsonb_each(coalesce(v_expect -> 'bag', '{}')) loop
    select to_jsonb(b) || jsonb_build_object('bought_at',
             to_char(b.bought_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      into v_row from public.bag_entries b where b.id = test.fx(p_no, v_key);
    for v_field in select jsonb_object_keys(v_want) loop
      v_got := case when v_field in ('item_id', 'purchase_event', 'closed_by_command')
                    then coalesce(v_names -> (v_row ->> v_field), v_row -> v_field)
                    else v_row -> v_field end;
      if v_got is distinct from v_want -> v_field then
        v_bad := v_bad || format('bag.%s.%s: got %s, want %s', v_key, v_field, v_got, v_want -> v_field);
      end if;
    end loop;
  end loop;

  select coalesce(jsonb_agg(
           jsonb_build_object('id', v_names -> e.id::text, 'kind', e.kind, 'item_id', v_names -> e.item_id::text)
           || case e.kind
                when 'purchase' then jsonb_build_object('qty', e.qty)
                when 'correction' then jsonb_build_object('before', e.before, 'after', e.after,
                                                          'reverses', v_names -> e.reverses::text)
                when 'dismiss' then '{}'::jsonb
                else jsonb_build_object('qty', e.qty, 'after', e.after)
              end
           order by e.seq), '[]')
    into v_got
    from public.item_events e
   where e.household_id in (test.fx(p_no, 'h1'), test.fx(p_no, 'h2')) and e.origin = 'live';
  if v_got is distinct from coalesce(v_expect -> 'events', '[]') then
    v_bad := v_bad || format('events: got %s, want %s', v_got, coalesce(v_expect -> 'events', '[]'));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('command', v_names -> (r ->> 'id'), 'reason', r ->> 'reason')
                            order by n), '[]')
    into v_got
    from jsonb_array_elements(v_response -> 'results') with ordinality t(r, n)
   where r ->> 'status' = 'rejected';
  if v_got is distinct from coalesce(v_expect -> 'rejections', '[]') then
    v_bad := v_bad || format('rejections: got %s, want %s', v_got, coalesce(v_expect -> 'rejections', '[]'));
  end if;

  return v_bad;
end;
$$;

do $$
declare
  v_doc    jsonb := current_setting('fixture.doc')::jsonb;
  v_case   jsonb;
  v_no     bigint;
  v_bad    text[];
  v_failed text[] := '{}';
begin
  for v_case, v_no in select value, ordinality from jsonb_array_elements(v_doc -> 'cases') with ordinality loop
    v_bad := test.fx_case(v_no::integer, v_case, v_doc -> 'defaults');
    if cardinality(v_bad) = 0 then
      raise notice 'ok - fixture: %', v_case ->> 'name';
    else
      v_failed := v_failed || format('%s: %s', v_case ->> 'name', array_to_string(v_bad, '; '));
    end if;
  end loop;
  if cardinality(v_failed) > 0 then
    raise exception 'not ok - % of % fixture cases disagree:%', cardinality(v_failed),
      jsonb_array_length(v_doc -> 'cases'), E'\n  ' || array_to_string(v_failed, E'\n  ');
  end if;
end;
$$;
