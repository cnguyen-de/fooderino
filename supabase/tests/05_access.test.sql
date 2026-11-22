\o /dev/null

select test.user('a-una') as una, test.user('a-vic') as vic, test.user('a-wes') as wes \gset
select test.household(:'una', 'Una home') as h \gset
select test.household(:'vic', 'Vic home') as hv \gset
select test.item(:'una', :'h', 'Milk', 2) as milk \gset
select test.item(:'vic', :'hv', 'Tea', 1) as tea \gset
select test.apply(:'vic', jsonb_build_array(test.cmd('tick', :'hv', :'tea', jsonb_build_object('bag_id', test.id('a-bag'), 'qty', 1, 'from_list', 0))));

-- Reading across households
begin;
select test.act_as(:'una');
select test.eq(public.my_household(), :'h'::uuid, 'my_household is the caller''s live household');
select test.eq((select count(*) from public.items_v2 where household_id = :'hv'), 0::bigint, 'RLS hides another household''s items');
select test.eq((select count(*) from public.bag_entries where household_id = :'hv')
             + (select count(*) from public.item_events where household_id = :'hv')
             + (select count(*) from public.command_log where household_id = :'hv')
             + (select count(*) from public.household_members where household_id = :'hv')
             + (select count(*) from public.households where id = :'hv'), 0::bigint,
               'RLS hides another household''s bag, events, log, members and row');
select test.eq((select count(*) from public.items_v2 where id = :'milk'), 1::bigint, 'a member reads their own items');
update public.items_v2 set name = 'Stolen' where id = :'tea';
select test.throws(format('insert into public.items_v2 (id, household_id, name, updated_at) values (%L, %L, %L, now())
                           on conflict (id) do update set name = excluded.name', :'tea', :'hv', 'Stolen'),
                   '42501', 'an upsert into another household is denied');
commit;
select test.eq((select name from public.items_v2 where id = :'tea'), 'Tea', 'an update aimed at another household changes nothing');

-- Server-owned fields and LWW
begin;
select test.act_as(:'una');
select test.throws(format('update public.items_v2 set amount = 99 where id = %L', :'milk'), '42501', 'a client cannot update amount');
select test.throws(format('update public.items_v2 set to_buy = 9 where id = %L', :'milk'), '42501', 'a client cannot update to_buy');
select test.throws(format('update public.items_v2 set best_before = current_date where id = %L', :'milk'), '42501', 'a client cannot update best_before');
select test.throws(format('update public.items_v2 set merged_into = null where id = %L', :'milk'), '42501', 'a client cannot update merged_into');
select test.throws(format('update public.items_v2 set seq = 0 where id = %L', :'milk'), '42501', 'a client cannot update seq');
select test.throws(format('insert into public.items_v2 (id, household_id, name, updated_at, amount) values (%L, %L, %L, now(), 5)
                           on conflict (id) do update set name = excluded.name', :'milk', :'h', 'Milk'),
                   '42501', 'a client upsert cannot carry amount');
commit;

select seq as seq_before from public.items_v2 where id = :'milk' \gset
begin;
select test.act_as(:'una');
insert into public.items_v2 (id, household_id, name, aliases, tags, updated_at)
values (:'milk', :'h', 'Whole milk', '{Melk}', '[{"kind": "place", "name": "Fridge"}]', now() + interval '1 minute')
on conflict (id) do update set id = excluded.id, household_id = excluded.household_id, name = excluded.name,
  aliases = excluded.aliases, tags = excluded.tags, updated_at = excluded.updated_at;
update public.items_v2 set name = 'Old sheet', updated_at = now() - interval '1 day' where id = :'milk';
select test.throws(format('insert into public.items_v2 (id, household_id, name, updated_at) values (%L, %L, %L, now())
                           on conflict (id) do update set name = excluded.name', test.id('a-new-item'), :'h', 'New'),
                   '42501', 'an upsert cannot create an item: creation goes through the create command');
select test.throws(format('update public.items_v2 set id = %L where id = %L', test.id('a-other-id'), :'milk'),
                   '42501', 'an item id is immutable');
commit;
select test.eq((select name || '/' || aliases::text || '/' || amount from public.items_v2 where id = :'milk'),
               'Whole milk/{Melk}/2', 'a metadata upsert onto an existing item lands and keeps server stock');
select test.ok((select seq from public.items_v2 where id = :'milk') > :'seq_before'::bigint,
               'an accepted metadata write takes a new seq');
select test.eq((select count(*) from public.items_v2 where name = 'Old sheet'), 0::bigint,
               'stamp_lww drops an update older than the stored row');

begin;
select test.act_as(:'una');
insert into public.households (id, name, updated_at) values (:'h', 'Una & co', now() + interval '1 minute')
on conflict (id) do update set id = excluded.id, name = excluded.name, updated_at = excluded.updated_at;
select test.throws(format('insert into public.households (id, name, updated_at) values (%L, %L, now())
                           on conflict (id) do update set name = excluded.name', test.id('a-new-household'), 'Mine'),
                   '42501', 'a client cannot create a household');
select test.throws(format('update public.households set deleted_at = now() where id = %L', :'h'),
                   '42501', 'a client cannot archive a household');
commit;
select test.eq((select name from public.households where id = :'h'), 'Una & co', 'a member renames their household by upsert');

-- Candidates and memberships
begin;
select test.act_as('a0000000-0000-0000-0000-00000000000c');
select test.eq((select count(*) from public.household_candidates), 2::bigint, 'a candidate reads their own candidate rows');
select test.eq((select count(*) from public.items_v2) + (select count(*) from public.households), 0::bigint,
               'a candidate sees no grocery data until they pick');
commit;
begin;
select test.act_as(:'una');
select test.eq((select count(*) from public.household_candidates), 0::bigint, 'nobody reads another user''s candidates');
commit;

select public.move_household(test.id('a-wes-create'), :'wes', 'create', '{"name": "Wes home"}');
select public.move_household(test.id('a-wes-leave'), :'wes', 'leave', '{}');
begin;
select test.act_as(:'wes');
select test.eq((select count(*) from public.household_members where user_id = :'wes' and deleted_at is not null), 1::bigint,
               'a user reads their own membership row after leaving');
select test.eq((select count(*) from public.items_v2) + (select count(*) from public.households), 0::bigint,
               'a user who left reads none of the household');
commit;

-- Tables and functions clients never touch
begin;
select test.act_as(:'una');
select test.throws('select * from public.legacy_log_audit', '42501', 'clients cannot read the legacy log audit');
select test.throws('select * from public.household_moves', '42501', 'clients cannot read household moves');
select test.throws('select * from public.household_clocks', '42501', 'clients cannot read clocks');
select test.throws('select * from public.migration_runs', '42501', 'clients cannot read migration runs');
select test.throws(format('select public.move_household(%L, %L, %L, %L)', gen_random_uuid(), :'una', 'leave', '{}'),
                   '42501', 'clients cannot call move_household; Nitro calls it as the service role');
select test.throws('select private.uuid_for(''x'')', '42501', 'clients cannot reach the private schema');
commit;
begin;
set local role anon;
select test.throws('select * from public.items_v2', '42501', 'anon reads no household table');
select test.throws('select public.apply_commands(''[]'')', '42501', 'anon cannot call apply_commands');
commit;
begin;
set local role service_role;
select test.eq(public.move_household(test.id('a-svc'), :'una', 'leave', '{}') ->> 'status', 'ok',
               'the service role calls move_household');
commit;
select public.move_household(test.id('a-una-back'), :'una', 'create', '{"name": "Una again"}');

-- Share tokens
select private.household_of(:'una') as h2 \gset
begin;
select test.act_as(:'una');
insert into public.household_share_tokens (token_hash, household_id, created_by, expires_at)
values (encode(sha256('a-tok'::bytea), 'hex'), :'h2', :'una', now() + interval '1 day');
select test.throws(format('insert into public.household_share_tokens (token_hash, household_id, created_by, expires_at)
                           values (%L, %L, %L, now())', encode(sha256('a-tok2'::bytea), 'hex'), :'hv', :'una'),
                   '42501', 'a member cannot mint a token for another household');
commit;
select test.eq((select count(*) from public.household_share_tokens where household_id = :'h2'), 1::bigint,
               'a member mints a share token for their household');

begin;
select test.act_as(:'una');
insert into public.household_recipes (id, household_id, name, updated_at)
values (test.id('a-recipe'), :'h2', 'Canh chua', now())
on conflict (id) do update set name = excluded.name, updated_at = excluded.updated_at;
insert into public.cooked_recipes (id, household_id, recipe_id, date, updated_at)
values (test.id('a-cooked'), :'h2', test.id('a-recipe'), current_date, now())
on conflict (id) do update set date = excluded.date, updated_at = excluded.updated_at;
select test.throws(format('insert into public.household_recipes (id, household_id, name, updated_at) values (%L, %L, %L, now())',
                          test.id('a-recipe-theirs'), :'hv', 'Theirs'),
                   '42501', 'a member cannot add a recipe to another household');
select test.throws(format('update public.household_recipes set seq = 0 where id = %L', test.id('a-recipe')),
                   '42501', 'a client cannot write a recipe''s seq');
select test.throws(format('update public.cooked_recipes set seq = 0 where id = %L', test.id('a-cooked')),
                   '42501', 'a client cannot write a cooked dish''s seq');
commit;
select test.eq((select count(*) from public.household_recipes where id = test.id('a-recipe'))
             + (select count(*) from public.cooked_recipes where id = test.id('a-cooked')), 2::bigint,
               'a member adds a recipe and a cooked dish to their household by upsert');

begin;
select test.act_as(:'vic');
select test.eq((select count(*) from public.household_recipes where household_id = :'h2')
             + (select count(*) from public.cooked_recipes where household_id = :'h2'), 0::bigint,
               'RLS hides another household''s recipes and meals');
update public.household_recipes set name = 'Stolen' where id = test.id('a-recipe');
select test.throws(format('insert into public.household_recipes (id, household_id, name, updated_at) values (%L, %L, %L, now() + interval ''1 hour'')
                           on conflict (id) do update set name = excluded.name, updated_at = excluded.updated_at',
                          test.id('a-recipe'), :'hv', 'Stolen'),
                   '42501', 'an upsert onto another household''s recipe is denied');
commit;
select test.eq((select name from public.household_recipes where id = test.id('a-recipe')), 'Canh chua',
               'an update aimed at another household''s recipe changes nothing');

-- CHECKs that would pass on NULL if written naively
select test.throws(format('insert into public.item_events (id, household_id, item_id, kind, occurred_at, origin) values (%L, %L, %L, %L, now(), %L)',
                          gen_random_uuid(), :'h2', :'milk', 'consume', 'backfill'), '23514', 'a consume without qty is refused');
select test.throws(format('insert into public.item_events (id, household_id, item_id, kind, qty, occurred_at, origin) values (%L, %L, %L, %L, 1, now(), %L)',
                          gen_random_uuid(), :'h2', :'milk', 'waste', 'backfill'), '23514', 'a waste without after is refused');
select test.throws(format('insert into public.item_events (id, household_id, item_id, kind, occurred_at, origin) values (%L, %L, %L, %L, now(), %L)',
                          gen_random_uuid(), :'h2', :'milk', 'purchase', 'backfill'), '23514', 'a purchase without qty is refused');
select test.throws(format('insert into public.item_events (id, household_id, item_id, kind, after, occurred_at, origin) values (%L, %L, %L, %L, %L, now(), %L)',
                          gen_random_uuid(), :'h2', :'milk', 'correction', '{"amount": 1}', 'backfill'), '23514', 'a correction without before is refused');
select test.throws(format('insert into public.item_events (id, household_id, item_id, kind, qty, after, occurred_at, origin) values (%L, %L, %L, %L, 1, %L, now(), %L)',
                          gen_random_uuid(), :'h2', :'milk', 'consume', '{"amount": 1}', 'backfill'), '23514', 'a consume whose after is not a number is refused');
select test.throws(format('insert into public.item_events (id, household_id, item_id, kind, qty, occurred_at, origin) values (%L, %L, %L, %L, 1, now(), %L)',
                          gen_random_uuid(), :'h2', :'milk', 'dismiss', 'backfill'), '23514', 'a dismiss with a qty is refused');
select test.throws(format('insert into public.item_events (id, household_id, item_id, kind, qty, occurred_at, origin) values (%L, %L, %L, %L, 1, now(), %L)',
                          gen_random_uuid(), :'h2', :'milk', 'purchase', 'live'), '23514', 'a live event without a command is refused');
select test.throws(format('update public.items_v2 set tags = %L where id = %L', t, :'milk'), '23514', 'tags ' || t || ' are refused')
  from unnest(array['{}', '["Fridge"]', '[{"kind": null, "name": "x"}]', '[{"kind": "place"}]',
                    '[{"kind": "place", "name": "  "}]', '[{"kind": "place", "name": 3}]',
                    '[{"kind": "place", "name": "x", "extra": 1}]']) t;
select test.throws(format('update public.items_v2 set aliases = %L where id = %L', '{NULL}', :'milk'), '23514', 'a NULL alias is refused');

-- Realtime
select test.eq((select array_agg(tablename::text order by tablename) from pg_publication_tables where pubname = 'supabase_realtime'),
               array['bag_entries', 'command_log', 'cooked_recipes', 'household_members', 'household_recipes', 'households',
                     'item_events', 'items_v2', 'meal_ingredients', 'rejected_commands'],
               'Realtime publishes every household table');
