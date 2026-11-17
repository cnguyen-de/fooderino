-- Two real sessions through dblink: one holds a transaction open while the
-- other runs, so each race below is forced rather than hoped for.

\o /dev/null

create function test.open(p_conn text, p_user uuid) returns void
language plpgsql as $$
begin
  perform dblink_connect(p_conn, 'dbname=postgres user=postgres');
  perform dblink_exec(p_conn, 'begin');
  perform dblink_exec(p_conn, format('set local request.jwt.claims = %L',
                                     jsonb_build_object('sub', p_user, 'role', 'authenticated')));
  perform dblink_exec(p_conn, 'set local role authenticated');
end;
$$;

create function test.remote(p_conn text, p_sql text) returns text
language sql as $$
  select r from dblink(p_conn, p_sql, false) as t(r text)
$$;

create function test.send(p_conn text, p_sql text) returns void
language plpgsql as $$
begin
  perform dblink_send_query(p_conn, p_sql);
end;
$$;

-- The async result, or the remote error message when it failed.
create function test.collect(p_conn text) returns text
language plpgsql as $$
declare
  v_out text;
begin
  select r into v_out from dblink_get_result(p_conn, false) as t(r text);
  if v_out is null then v_out := 'error: ' || dblink_error_message(p_conn); end if;
  perform r from dblink_get_result(p_conn, false) as t(r text);
  return v_out;
end;
$$;

create function test.close(p_conn text) returns void
language plpgsql as $$
begin
  perform dblink_exec(p_conn, 'commit', false);
  perform dblink_disconnect(p_conn);
end;
$$;

create function test.waits(p_conn text) returns boolean
language plpgsql as $$
begin
  perform pg_sleep(0.3);
  return dblink_is_busy(p_conn) = 1;
end;
$$;

create function test.apply_sql(p_cmds jsonb) returns text
language sql immutable as $$
  select format('select public.apply_commands(%L)::text', p_cmds)
$$;

select test.user('k-pia') as pia, test.user('k-quin') as quin, test.user('k-rex') as rex \gset
select test.household(:'pia', 'Pia home') as h \gset
select test.household(:'rex', 'Rex home') as hr \gset
select test.share(:'h', :'pia', 'k-pia-token');
select public.move_household(test.id('k-quin-joins'), :'quin', 'join', '{"token": "k-pia-token", "bring": false}');
select test.item(:'pia', :'h', 'Milk', 1) as milk \gset
select test.item(:'pia', :'h', 'Eggs', 1) as eggs \gset
select test.item(:'rex', :'hr', 'Tea', 1) as tea \gset

-- Seq is commit order: a second writer to the household waits for the first to commit.
select test.open('a', :'pia');
select test.remote('a', test.apply_sql(jsonb_build_array(test.cmd('want', :'h', :'milk', '{"qty": 2}')))) as first \gset
select test.open('b', :'quin');
select test.send('b', test.apply_sql(jsonb_build_array(test.cmd('want', :'h', :'eggs', '{"qty": 3}'))));
select test.open('c', :'rex');
select test.send('c', test.apply_sql(jsonb_build_array(test.cmd('want', :'hr', :'tea', '{"qty": 1}'))));
select test.ok(test.waits('b'), 'a second writer to the same household waits on its clock');
select test.ok(not test.waits('c'), 'a writer to another household does not wait');
select test.collect('c'); select test.close('c');
select test.close('a');
select test.collect('b') as second \gset
select test.close('b');
select test.ok((:'second'::jsonb #>> '{items,0,seq}')::bigint > (:'first'::jsonb #>> '{items,0,seq}')::bigint,
               'the later commit gets the higher seq');
create temp view household_seqs as
select h.id as household_id, s.seq
  from public.households h
 cross join lateral (
   select h.seq
   union all select seq from public.household_members where household_id = h.id
   union all select seq from public.items_v2 where household_id = h.id
   union all select seq from public.bag_entries where household_id = h.id
   union all select seq from public.item_events where household_id = h.id
   union all select seq from public.command_log where household_id = h.id
   union all select seq from public.rejected_commands where household_id = h.id) s;
select test.ok(not exists (select seq from household_seqs where household_id = :'h' group by seq having count(*) > 1),
               'every row of a household holds a distinct seq from its one clock');
select test.eq((select position from public.household_clocks where household_id = :'h'),
               (select max(seq) from household_seqs where household_id = :'h'),
               'the clock stands at the last seq it issued');

-- The same command id from two sessions at once applies once.
select test.cmd('use', :'h', :'milk', '{"qty": 1, "waste": false}', test.id('k-dup')) as dup \gset
select test.open('a', :'pia');
select test.remote('a', test.apply_sql(jsonb_build_array(:'dup'::jsonb)));
select test.open('b', :'pia');
select test.send('b', test.apply_sql(jsonb_build_array(:'dup'::jsonb)));
select test.ok(test.waits('b'), 'a concurrent duplicate waits');
select test.close('a');
select test.collect('b') as dup_result \gset
select test.close('b');
select test.eq(test.result(:'dup_result'), 'accepted', 'the concurrent duplicate reads the first receipt');
select test.eq((select count(*) from public.item_events where command_id = test.id('k-dup')), 1::bigint,
               'the concurrent duplicate applied once');

-- Two members unpack one bag entry at the same moment.
select test.apply(:'pia', jsonb_build_array(test.cmd('tick', :'h', :'eggs', jsonb_build_object('bag_id', test.id('k-bag'), 'qty', 4, 'from_list', 0))));
select test.stock(:'eggs') ->> 'amount' as eggs_before \gset
select test.open('a', :'pia');
select test.remote('a', test.apply_sql(jsonb_build_array(test.cmd('unpack', :'h', :'eggs', jsonb_build_object('bag_id', test.id('k-bag'))))));
select test.open('b', :'quin');
select test.send('b', test.apply_sql(jsonb_build_array(test.cmd('unpack', :'h', :'eggs', jsonb_build_object('bag_id', test.id('k-bag'))))));
select test.ok(test.waits('b'), 'the second unpack waits for the first');
select test.close('a');
select test.collect('b') as unpack2 \gset
select test.close('b');
select test.eq(test.result(:'unpack2'), 'bag_closed', 'the losing concurrent unpack is rejected');
select test.eq((test.stock(:'eggs') ->> 'amount')::numeric - :'eggs_before'::numeric, 4::numeric,
               'two concurrent unpacks of one bag entry raise stock once');

-- A metadata update and a command on the same item, interleaved so that
-- without one lock order each would hold what the other needs. An upsert's
-- BEFORE INSERT trigger already takes the clock first; a plain UPDATE (a
-- PostgREST PATCH) locks the row first.
create function pg_temp.rename_sql(p_item uuid, p_name text) returns text
language sql as $$
  select format('update public.items_v2 set name = %L, updated_at = now() + interval ''1 hour''
                  where id = %L returning name', p_name, p_item)
$$;

alter table public.items_v2 disable trigger items_lock;
select test.open('a', :'pia');
select test.remote('a', test.apply_sql(jsonb_build_array(test.cmd('want', :'h', :'eggs', '{"qty": 1}'))));
select test.open('b', :'quin');
select test.send('b', pg_temp.rename_sql(:'milk', 'Oat milk'));
select pg_sleep(0.3);
select coalesce(test.remote('a', test.apply_sql(jsonb_build_array(test.cmd('want', :'h', :'milk', '{"qty": 5}')))),
                'error: ' || dblink_error_message('a')) as control_a \gset
select test.close('a');
select test.collect('b') as control_b \gset
select test.close('b');
alter table public.items_v2 enable trigger items_lock;
select test.ok(:'control_a' like 'error:%deadlock%' or :'control_b' like 'error:%deadlock%',
               'control: without the statement lock the interleaving deadlocks');

select test.open('a', :'pia');
select test.remote('a', test.apply_sql(jsonb_build_array(test.cmd('want', :'h', :'eggs', '{"qty": 1}'))));
select test.open('b', :'quin');
select test.send('b', pg_temp.rename_sql(:'milk', 'Whole milk'));
select test.ok(test.waits('b'), 'a client update takes the household clock before the item row');
select test.remote('a', test.apply_sql(jsonb_build_array(test.cmd('want', :'h', :'milk', '{"qty": 5}')))) as fixed_a \gset
select test.close('a');
select test.collect('b') as fixed_b \gset
select test.close('b');
select test.eq(test.result(:'fixed_a') || '/' || :'fixed_b', 'accepted/Whole milk',
               'the command and the client update both commit, with no deadlock');
select test.eq((select name || '/' || to_buy from public.items_v2 where id = :'milk'), 'Whole milk/5',
               'both writes landed');
