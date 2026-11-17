\o /dev/null

create function pg_temp.move(p_request text, p_user uuid, p_action text, p_args jsonb default '{}') returns jsonb
language sql as $$
  select public.move_household(test.id(p_request), p_user, p_action, p_args)
$$;

select test.user('m-joy') as joy, test.user('m-kim') as kim, test.user('m-lou') as lou, test.user('m-max') as max \gset

-- Create
select pg_temp.move('m-joy-create', :'joy', 'create', '{"name": "  Joy home "}') as created \gset
select (:'created'::jsonb ->> 'household_id')::uuid as hj \gset
select test.eq((select h.name || '/' || m.role from public.households h join public.household_members m on m.household_id = h.id
                 where m.user_id = :'joy' and m.deleted_at is null), 'Joy home/admin',
               'create makes a household and an admin membership');
select test.eq(pg_temp.move('m-joy-create2', :'joy', 'create', '{"name": "Second"}') ->> 'reason', 'already_member',
               'a member cannot create a second household');
select test.eq(pg_temp.move('m-lou-blank', :'lou', 'create', '{"name": "  "}') ->> 'reason', 'invalid_name',
               'a household needs a name');
select test.throws(format('insert into public.household_members (id, household_id, user_id, email) values (%L, %L, %L, %L)',
                          gen_random_uuid(), '10000000-0000-0000-0000-000000000004', :'joy', 'other@test.local'),
                   '23505', 'the database refuses a second live membership for a user');
select test.throws(format('insert into public.household_members (id, household_id, email) values (%L, %L, %L)',
                          gen_random_uuid(), '10000000-0000-0000-0000-000000000004', 'm-joy@test.local'),
                   '23505', 'the database refuses a second live membership for an email');

-- Request idempotence
select test.eq(pg_temp.move('m-joy-create', :'joy', 'create', '{"name": "Changed my mind"}'), :'created'::jsonb,
               'a retried move request returns the first result');
select test.eq((select count(*) from public.households where name in ('Joy home', 'Changed my mind')), 1::bigint,
               'a retried move request changes nothing');
select test.throws(format('select public.move_household(%L, %L, %L, %L)', test.id('m-joy-create'), :'kim', 'leave', '{}'),
                   '22023', 'a request id belongs to the user who first sent it');

-- The joiner's household: Kim and Lou share it.
select test.household(:'kim', 'Kim home') as hk \gset
select test.share(:'hk', :'kim', 'm-kim-token');
select test.eq(pg_temp.move('m-lou-joins-kim', :'lou', 'join', '{"token": "m-kim-token"}') ->> 'status', 'ok',
               'a user with no household joins by token');
select test.apply(:'kim', jsonb_build_array(
  test.cmd('create', :'hk', test.id('m-semi'), '{"item": {"name": "Semi skimmed", "aliases": ["milk"], "tags": [{"kind": "place", "name": "Door"}], "unit": "count", "default_amount": 1, "shelf_life_days": 7}, "start": {"amount": 2, "to_buy": 1, "best_before": "2026-11-20"}}'),
  test.cmd('create', :'hk', test.id('m-coffee'), '{"item": {"name": "Coffee", "aliases": [], "tags": [], "unit": "count", "default_amount": 1, "shelf_life_days": null}, "start": {"amount": 1}}'),
  test.cmd('create', :'hk', test.id('m-rice-g'), '{"item": {"name": "Rice", "aliases": [], "tags": [], "unit": "gram", "default_amount": 500, "shelf_life_days": null}, "start": {"amount": 800}}'),
  test.cmd('create', :'hk', test.id('m-cheese'), '{"item": {"name": "cheese", "aliases": [], "tags": [], "unit": "count", "default_amount": 1, "shelf_life_days": null}, "start": {"amount": 1}}'),
  test.cmd('tick', :'hk', test.id('m-coffee'), jsonb_build_object('bag_id', test.id('m-bag-kim'), 'qty', 1, 'from_list', 0))));
select test.apply(:'lou', jsonb_build_array(
  test.cmd('tick', :'hk', test.id('m-semi'), jsonb_build_object('bag_id', test.id('m-bag-lou'), 'qty', 2, 'from_list', 1))));

-- The target household: Joy's.
select test.apply(:'joy', jsonb_build_array(
  test.cmd('create', :'hj', test.id('m-milk'), '{"item": {"name": "Milk", "aliases": [], "tags": [{"kind": "place", "name": "Fridge"}], "unit": "count", "default_amount": 1, "shelf_life_days": null}, "start": {"amount": 1, "best_before": "2026-11-25"}}'),
  test.cmd('create', :'hj', test.id('m-rice-c'), '{"item": {"name": "rice", "aliases": [], "tags": [], "unit": "count", "default_amount": 1, "shelf_life_days": null}, "start": {"amount": 1}}'),
  test.cmd('create', :'hj', test.id('m-cheddar'), '{"item": {"name": "Cheddar", "aliases": ["Cheese"], "tags": [], "unit": "count", "default_amount": 1, "shelf_life_days": null}, "start": {"amount": 1}}'),
  test.cmd('create', :'hj', test.id('m-gouda'), '{"item": {"name": "Gouda", "aliases": ["cheese"], "tags": [], "unit": "count", "default_amount": 1, "shelf_life_days": null}, "start": {"amount": 1}}')));
select test.share(:'hj', :'joy', 'm-joy-token');
select test.share(:'hj', :'joy', 'm-old-token', now() - interval '1 minute');
insert into public.household_share_tokens (token_hash, household_id, created_by, expires_at, revoked_at)
values (encode(sha256('m-revoked'::bytea), 'hex'), :'hj', :'joy', now() + interval '1 day', now());

select test.eq(pg_temp.move('m-lou-bad1', :'lou', 'join', '{"token": "nope"}') ->> 'reason', 'missing', 'an unknown token is refused');
select test.eq(pg_temp.move('m-lou-bad2', :'lou', 'join', '{"token": "m-old-token"}') ->> 'reason', 'expired', 'an expired token is refused');
select test.eq(pg_temp.move('m-lou-bad3', :'lou', 'join', '{"token": "m-revoked"}') ->> 'reason', 'revoked', 'a revoked token is refused');
select test.eq(private.household_of(:'lou'), :'hk'::uuid, 'a refused join leaves the membership alone');

-- Join with bring
select pg_temp.move('m-lou-joins-joy', :'lou', 'join', '{"token": "m-joy-token", "bring": true}') as joined \gset
select test.eq(:'joined'::jsonb, jsonb_build_object('status', 'ok', 'household_id', :'hj'::uuid, 'merged', 1, 'copied', 3, 'bag', 1),
               'join with bring reports what merged, what was copied and the bag entries that followed');
select test.eq((select jsonb_build_object('amount', amount, 'to_buy', to_buy, 'best_before', best_before,
                                          'aliases', aliases, 'tags', tags)
                  from public.items_v2 where id = test.id('m-milk')),
               '{"amount": 3, "to_buy": 0, "best_before": "2026-11-20", "aliases": ["Semi skimmed"],
                 "tags": [{"kind": "place", "name": "Fridge"}, {"kind": "place", "name": "Door"}]}'::jsonb,
               'join with bring merges by alias: counts add, soonest date, names and tags union');
select test.eq((select jsonb_build_object('name', name, 'amount', amount, 'household', household_id = :'hj')
                  from public.items_v2 where id = private.uuid_for('move:' || test.id('m-lou-joins-joy') || ':' || test.id('m-coffee'))),
               '{"name": "Coffee", "amount": 1, "household": true}'::jsonb,
               'an unmatched item is copied under a deterministic id');
select test.eq((select count(*) from public.items_v2 where household_id = :'hj' and name = 'Rice' and unit = 'gram'), 1::bigint,
               'a name match with a different unit is copied, not merged');
select test.eq((select count(*) from public.items_v2 where household_id = :'hj' and name = 'cheese'), 1::bigint,
               'a name matching two items is copied, not merged');
select test.eq((select jsonb_build_object('item', item_id = test.id('m-milk'), 'qty', qty, 'from_list', from_list, 'state', state)
                  from public.bag_entries where household_id = :'hj'),
               '{"item": true, "qty": 2, "from_list": 1, "state": "open"}'::jsonb,
               'the mover''s open bag entry follows its item; another member''s does not');
select test.eq((select origin || '/' || kind from public.item_events e join public.bag_entries b on b.purchase_event = e.id
                 where b.household_id = :'hj'), 'import/purchase', 'the copied bag entry has a purchase event to reverse');
select test.eq((select amount from public.items_v2 where id = test.id('m-semi')), 2::numeric,
               'items stay with the household that was left');
select test.ok((select deleted_at is null from public.households where id = :'hk'),
               'a household with a member left is not archived');
select test.eq(pg_temp.move('m-lou-joins-joy', :'lou', 'join', '{"token": "m-joy-token", "bring": true}'), :'joined'::jsonb,
               'a retried join returns the first result');
select test.eq((select count(*) from public.items_v2 where household_id = :'hj'), 7::bigint,
               'a retried join brings nothing twice');
select test.eq(test.result(test.apply(:'lou', jsonb_build_array(
                 test.cmd('unpack', :'hj', test.id('m-milk'), jsonb_build_object('bag_id',
                   private.uuid_for('move-bag:' || test.id('m-lou-joins-joy') || ':' || test.id('m-bag-lou'))))))),
               'accepted', 'the copied bag entry can be unpacked in the new household');

-- Join without bring, leave, rejoin
select test.share(:'hk', :'kim', 'm-kim-token2');
select pg_temp.move('m-max-create', :'max', 'create', '{"name": "Max home"}');
select test.apply(:'max', jsonb_build_array(test.cmd('create', private.household_of(:'max'), test.id('m-max-item'),
  '{"item": {"name": "Jam", "aliases": [], "tags": [], "unit": "count", "default_amount": 1, "shelf_life_days": null}, "start": {}}')));
select private.household_of(:'max') as hm \gset
select test.eq(pg_temp.move('m-max-joins-kim', :'max', 'join', '{"token": "m-kim-token2", "bring": false}')
                 ->> 'copied', '0', 'join without bring brings nothing');
select test.ok((select deleted_at is not null from public.households where id = :'hm'),
               'the last member leaving archives the household');
select test.eq(pg_temp.move('m-max-joins-old', :'max', 'join', '{"token": "m-joy-token"}') ->> 'status', 'ok',
               'joining moves a member out of their household');
select id as lou_row from public.household_members where household_id = :'hj' and user_id = :'lou' \gset
select pg_temp.move('m-lou-leaves-joy', :'lou', 'leave', '{}');
select pg_temp.move('m-lou-rejoins-joy', :'lou', 'join', '{"token": "m-joy-token"}');
select test.eq((select id from public.household_members where household_id = :'hj' and user_id = :'lou' and deleted_at is null),
               :'lou_row'::uuid, 'rejoining a household revives the same membership row');
select test.eq(pg_temp.move('m-kim-leaves', :'kim', 'leave', '{}') ->> 'status', 'ok', 'a member leaves');
select test.eq(pg_temp.move('m-kim-leaves2', :'kim', 'leave', '{}') ->> 'reason', 'not_member', 'leaving twice is refused');
select test.ok((select deleted_at is not null from public.households where id = :'hk'),
               'the household archives once its last member leaves');
select test.eq(pg_temp.move('m-max-back', :'max', 'join', '{"token": "m-kim-token2"}') ->> 'reason', 'household_gone',
               'an archived household cannot be joined');

-- Pick (Carol was in lists 2 and 3, Erin too)
select test.eq(pg_temp.move('m-carol-bad', 'a0000000-0000-0000-0000-00000000000c', 'pick',
                            jsonb_build_object('household', :'hj')) ->> 'reason', 'not_candidate',
               'a user can only pick a household they were a candidate of');
select pg_temp.move('m-carol-pick', 'a0000000-0000-0000-0000-00000000000c', 'pick',
                    '{"household": "10000000-0000-0000-0000-000000000003", "import": ["10000000-0000-0000-0000-000000000002"]}') as picked \gset
select test.eq(:'picked'::jsonb ->> 'status' || '/' || (:'picked'::jsonb ->> 'merged') || '/' || (:'picked'::jsonb ->> 'copied'),
               'ok/1/1', 'pick imports a left household''s items: Rice merges, Soy sauce is copied');
select test.eq((select role from public.household_members where user_id = 'a0000000-0000-0000-0000-00000000000c' and deleted_at is null),
               'admin', 'the picked household keeps the role the user had there');
select test.eq((select jsonb_build_object('amount', amount, 'to_buy', to_buy, 'tags', tags) from public.items_v2 where legacy_id = 8),
               '{"amount": 700, "to_buy": 100, "tags": [{"kind": "place", "name": "Shelf"}, {"kind": "place", "name": "Pantry"}, {"kind": "store", "name": "Asian market"}]}'::jsonb,
               'imported Rice merged into the picked household''s rice');
select test.eq((select count(*) from public.household_candidates
                 where user_id = 'a0000000-0000-0000-0000-00000000000c' and consumed_at is null), 0::bigint,
               'pick consumes every candidate row of the user');
select test.eq(pg_temp.move('m-carol-pick2', 'a0000000-0000-0000-0000-00000000000c', 'pick',
                            '{"household": "10000000-0000-0000-0000-000000000002"}') ->> 'reason', 'already_member',
               'a member cannot pick again');
select test.ok((select deleted_at is null from public.households where id = '10000000-0000-0000-0000-000000000002'),
               'a household another candidate may still pick is kept');
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000e1', 'erin@x.com') on conflict (id) do nothing;
select pg_temp.move('m-erin-pick', 'a0000000-0000-0000-0000-0000000000e1', 'pick', '{"household": "10000000-0000-0000-0000-000000000003"}');
select test.ok((select deleted_at is not null from public.households where id = '10000000-0000-0000-0000-000000000002'),
               'a household with no member and no open candidate is archived');
select test.eq((select legacy_id from public.items_v2 where legacy_id = 7 and amount = 500), 7::bigint,
               'import copies items; the source household keeps its own');
