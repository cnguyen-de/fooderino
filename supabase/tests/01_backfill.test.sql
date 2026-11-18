\o /dev/null

-- Households
select test.eq((select count(*) from public.households where legacy_id is not null), 5::bigint,
               'every legacy list became a household');
select test.ok(exists (select 1 from public.households
                        where id = '10000000-0000-0000-0000-000000000002' and legacy_id = 2 and deleted_at is null),
               'a list with a null admin is kept, with the same id');
select test.ok(exists (select 1 from public.households where id = private.uuid_for('list:5') and name = 'Ghost'),
               'a list with no uuid gets a deterministic minted id');

-- Census
select test.eq((select jsonb_agg(jsonb_build_object('email', email, 'role', role, 'user', user_id is not null,
                                                    'name', name) order by email)
                  from public.household_members where household_id = '10000000-0000-0000-0000-000000000001'),
               '[{"email": "alice@x.com", "role": "admin", "user": true, "name": "Alice"},
                 {"email": "bob@x.com", "role": "member", "user": true, "name": null},
                 {"email": "dave@x.com", "role": "member", "user": false, "name": "Dave"}]'::jsonb,
               'single-list emails become members, lowercased, admin from the users array');
select test.eq((select jsonb_build_object('role', role, 'name', name, 'avatar', avatar)
                  from public.household_members where email = 'frank@x.com'),
               '{"role": "admin", "name": "Frank", "avatar": "f.png"}'::jsonb,
               'a lists.admin missing from lists.users is still a member, with auth metadata');
select test.eq((select array_agg(household_id order by household_id) from public.household_candidates
                 where user_id = 'a0000000-0000-0000-0000-00000000000c'),
               array['10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003']::uuid[],
               'a user in several lists becomes one candidate per list');
select test.ok(not exists (select 1 from public.household_members where email in ('carol@x.com', 'erin@x.com')),
               'a multi-list user has no membership until they pick');
select test.eq((select role from public.household_candidates
                 where email = 'carol@x.com' and household_id = '10000000-0000-0000-0000-000000000003'),
               'admin', 'a candidate keeps the role it had in that list');
select test.eq((select count(*) from public.household_candidates where email = 'erin@x.com' and user_id is null),
               2::bigint, 'an email with no auth row stays an email-only candidate');

-- Items
select test.eq((select jsonb_build_object('id', id, 'tags', tags, 'unit', unit, 'amount', amount,
                                          'shelf_life_days', shelf_life_days, 'best_before', best_before)
                  from public.items_v2 where legacy_id = 1),
               jsonb_build_object('id', private.uuid_for('item:1'),
                                  'tags', '[{"kind": "place", "name": "Fridge"}, {"kind": "store", "name": "Lidl"}]'::jsonb,
                                  'unit', 'count', 'amount', 2, 'shelf_life_days', null, 'best_before', '2026-11-20'),
               'location and store become place and store tags, counters copied, id deterministic');
select test.eq((select tags from public.items_v2 where legacy_id = 2),
               '[{"kind": "place", "name": "fridge"}]'::jsonb, 'tag names are trimmed and blank stores skipped');
select test.eq((select jsonb_build_object('unit', unit, 'amount', amount, 'default_amount', default_amount)
                  from public.items_v2 where legacy_id = 5),
               '{"unit": "gram", "amount": 1500, "default_amount": 500}'::jsonb, 'kg becomes gram');
select test.eq((select amount from public.items_v2 where legacy_id = 6), 0::numeric,
               'a negative legacy amount is raised to 0');
select test.ok(not exists (select 1 from public.items_v2 where legacy_id in (10, 11)),
               'items with a null or dangling list are not migrated');

-- Legacy logs
select test.eq((select jsonb_agg(jsonb_build_object('log', right(id::text, 2), 'kind', kind, 'qty', qty,
                                                    'after', after, 'actor', actor is not null) order by id)
                  from public.item_events where origin = 'backfill'),
               '[{"log": "01", "kind": "purchase", "qty": 2, "after": null, "actor": true},
                 {"log": "02", "kind": "consume", "qty": 1, "after": 1, "actor": true},
                 {"log": "08", "kind": "consume", "qty": 500, "after": 1000, "actor": true},
                 {"log": "0a", "kind": "purchase", "qty": 3, "after": null, "actor": false},
                 {"log": "0b", "kind": "purchase", "qty": 1, "after": null, "actor": true}]'::jsonb,
               'qualifying logs become purchase or consume events under the log id');
select test.eq((select item_id from public.item_events where id = '20000000-0000-0000-0000-000000000001'),
               private.uuid_for('item:1'), 'a log name matches its item case- and space-insensitively');
select test.eq((select jsonb_object_agg(right(log_id::text, 2), reason) from public.legacy_log_audit),
               '{"03": "no_match", "04": "action", "05": "no_change", "06": "unparseable", "07": "ambiguous",
                 "09": "no_household", "0c": "action", "0d": "unparseable", "0e": "unparseable"}'::jsonb,
               'every other log lands in the audit with its reason');

-- Recipes
select test.eq((select jsonb_build_object('household', household_id, 'name', name, 'kind', kind,
                                          'ingredients', ingredients, 'instructions', instructions)
                  from public.household_recipes where id = private.uuid_for('recipe:1')),
               jsonb_build_object('household', '10000000-0000-0000-0000-000000000001'::uuid, 'name', 'Pancakes', 'kind', 'dish',
                                  'ingredients', '[{"name": "Flour", "item_id": null, "qty": null}]'::jsonb,
                                  'instructions', E'Fluffy\n\nMix.'),
               'a saved recipe moves to its owner''s household, description folded into instructions');
select test.eq((select count(*) from public.household_recipes where id = private.uuid_for('recipe:2')), 0::bigint,
               'an unsaved recipe of an owner with no single household is left behind');

-- Rerun
create temp table before_rerun as
select t.name, (select md5(coalesce(string_agg(r::text, ',' order by r::text), ''))
                  from (select to_jsonb(x) - 'synced_at' as r from public.households x where t.name = 'households'
                        union all select to_jsonb(x) from public.household_members x where t.name = 'members'
                        union all select to_jsonb(x) from public.household_candidates x where t.name = 'candidates'
                        union all select to_jsonb(x) from public.items_v2 x where t.name = 'items'
                        union all select to_jsonb(x) from public.item_events x where t.name = 'events'
                        union all select to_jsonb(x) from public.legacy_log_audit x where t.name = 'audit'
                        union all select to_jsonb(x) from public.household_recipes x where t.name = 'recipes'
                        union all select to_jsonb(x) from public.household_clocks x where t.name = 'clocks') rows) as sum
  from unnest(array['households', 'members', 'candidates', 'items', 'events', 'audit', 'recipes', 'clocks']) t(name);
\i /repo/supabase/backfill-v2.sql
\o /dev/null
select test.eq((select count(*) from public.migration_runs), 1::bigint, 'a rerun records no second migration run');
select test.ok(not exists (
  select 1 from before_rerun b
   where b.sum is distinct from (
     select md5(coalesce(string_agg(r::text, ',' order by r::text), ''))
       from (select to_jsonb(x) - 'synced_at' as r from public.households x where b.name = 'households'
             union all select to_jsonb(x) from public.household_members x where b.name = 'members'
             union all select to_jsonb(x) from public.household_candidates x where b.name = 'candidates'
             union all select to_jsonb(x) from public.items_v2 x where b.name = 'items'
             union all select to_jsonb(x) from public.item_events x where b.name = 'events'
             union all select to_jsonb(x) from public.legacy_log_audit x where b.name = 'audit'
             union all select to_jsonb(x) from public.household_recipes x where b.name = 'recipes'
             union all select to_jsonb(x) from public.household_clocks x where b.name = 'clocks') rows)),
  'a backfill rerun leaves every v2 table byte-identical');

-- Claim on first sign-in
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000d1', 'DAVE@x.com'),
                                          ('a0000000-0000-0000-0000-0000000000e1', 'erin@x.com');
select test.eq((select user_id from public.household_members where email = 'dave@x.com'),
               'a0000000-0000-0000-0000-0000000000d1'::uuid, 'signing in claims an email-only membership');
select test.eq((select count(*) from public.household_candidates
                 where email = 'erin@x.com' and user_id = 'a0000000-0000-0000-0000-0000000000e1'),
               2::bigint, 'signing in claims email-only candidate rows');
