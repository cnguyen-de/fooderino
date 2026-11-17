\o /dev/null

select test.user('c-ann') as ann, test.user('c-ben') as ben, test.user('c-cat') as cat \gset
select test.household(:'ann', 'Ann home') as h \gset
select test.household(:'cat', 'Cat home') as hc \gset
select test.share(:'h', :'ann', 'c-ann-token');
select public.move_household(test.id('c-ben-joins'), :'ben', 'join', '{"token": "c-ann-token", "bring": false}');

-- Receipts
select test.item(:'ann', :'h', 'Milk', 2) as milk \gset
select test.cmd('use', :'h', :'milk', '{"qty": 1, "waste": false}', test.id('c-use-once')) as use_once \gset
select test.apply(:'ann', jsonb_build_array(:'use_once'::jsonb)) as first \gset
select test.apply(:'ben', jsonb_build_array(:'use_once'::jsonb)) as retry \gset
select test.eq(test.result(:'retry'), 'accepted', 'a retried command id reports its first result');
select test.eq(test.stock(:'milk') ->> 'amount', '1', 'applying one command id twice consumes once');
select test.eq((select count(*) from public.item_events where command_id = test.id('c-use-once')), 1::bigint,
               'applying one command id twice records one event');
select test.eq(:'retry'::jsonb - 'results', :'first'::jsonb - 'results',
               'a retry returns the same rows, seq included');
select test.eq((select actor from public.item_events where id = test.id('c-use-once')), :'ann'::uuid,
               'the actor comes from the JWT, not the payload');
select test.eq((select inverse from public.command_log where command_id = test.id('c-use-once')),
               jsonb_build_object('kind', 'restock', 'item_id', :'milk'::uuid, 'qty', 1,
                                  'reverses', test.id('c-use-once')),
               'command_log stores the TS Inverse for undo');

select test.cmd('use', :'h', :'milk', '{"qty": 5, "waste": false}', test.id('c-use-five')) as use_five \gset
select test.eq(test.result(test.apply(:'ann', jsonb_build_array(:'use_five'::jsonb))), 'insufficient_stock',
               'use beyond stock is rejected, not clipped');
select test.apply(:'ann', jsonb_build_array(test.cmd('set', :'h', :'milk', '{"amount": 10}')));
select test.eq(test.result(test.apply(:'ann', jsonb_build_array(:'use_five'::jsonb)))
               || '/' || (test.stock(:'milk') ->> 'amount'), 'insufficient_stock/10',
               'a rejection is a receipt too: the same id stays rejected after stock arrives');

-- Undo
select test.cmd('undo', :'h', :'milk', jsonb_build_object('target', test.id('c-use-once')), test.id('c-undo')) as undo \gset
select test.eq(test.result(test.apply(:'ben', jsonb_build_array(:'undo'::jsonb))) || '/'
               || (test.stock(:'milk') ->> 'amount'), 'accepted/11', 'undo after use restores the stock');
select test.eq(test.result(test.apply(:'ann', jsonb_build_array(
                 test.cmd('undo', :'h', :'milk', jsonb_build_object('target', test.id('c-use-once')))))), 'cannot_undo',
               'a second undo of the same command is rejected');
select test.eq(test.result(test.apply(:'ben', jsonb_build_array(:'undo'::jsonb))) || '/'
               || (test.stock(:'milk') ->> 'amount'), 'accepted/11', 'a retried undo changes nothing');
select test.eq((select undone_by from public.command_log where command_id = test.id('c-use-once')), test.id('c-undo'),
               'the undone command records which undo reversed it');

-- The bag
select test.item(:'ann', :'h', 'Eggs', 0, 6) as eggs \gset
select test.apply(:'ann', jsonb_build_array(
  test.cmd('tick', :'h', :'eggs', jsonb_build_object('bag_id', test.id('c-b1'), 'qty', 6, 'from_list', 6), test.id('c-tick1')))) as tick \gset
select test.eq(jsonb_build_object(
                 'status', test.result(:'tick'),
                 'item', (:'tick'::jsonb #>> '{items,0,id}')::uuid = :'eggs'::uuid and (:'tick'::jsonb #>> '{items,0,seq}')::bigint > 0,
                 'bag', :'tick'::jsonb #>> '{bag,0,state}',
                 'event', :'tick'::jsonb #>> '{events,0,kind}',
                 'event id', (:'tick'::jsonb #>> '{events,0,id}')::uuid = test.id('c-tick1'),
                 'inverse', :'tick'::jsonb #> '{commands,0,inverse,kind}'),
               '{"status": "accepted", "item": true, "bag": "open", "event": "purchase", "event id": true, "inverse": "cancel_bag"}'::jsonb,
               'the response carries the touched item, bag entry, event and log row with their seq');

select test.eq(test.result(test.apply(:'ann', jsonb_build_array(test.cmd('unpack', :'h', :'eggs', jsonb_build_object('bag_id', test.id('c-b1')))))),
               'accepted', 'one member unpacks');
select test.eq(test.result(test.apply(:'ben', jsonb_build_array(test.cmd('unpack', :'h', :'eggs', jsonb_build_object('bag_id', test.id('c-b1')))))),
               'bag_closed', 'a second unpack of the same bag entry is rejected');
select test.eq(test.stock(:'eggs') ->> 'amount', '6', 'two unpacks of one bag entry add its stock once');
select test.eq(test.result(test.apply(:'ben', jsonb_build_array(test.cmd('cancel_bag', :'h', :'eggs', jsonb_build_object('bag_id', test.id('c-b1')))))),
               'bag_closed', 'cancel_bag after unpack is rejected');

select test.apply(:'ann', jsonb_build_array(test.cmd('tick', :'h', :'eggs', jsonb_build_object('bag_id', test.id('c-b2'), 'qty', 2, 'from_list', 0))));
select test.apply(:'ben', jsonb_build_array(test.cmd('cancel_bag', :'h', :'eggs', jsonb_build_object('bag_id', test.id('c-b2')))));
select test.eq(test.result(test.apply(:'ann', jsonb_build_array(test.cmd('unpack', :'h', :'eggs', jsonb_build_object('bag_id', test.id('c-b2')))))),
               'bag_closed', 'unpack after cancel_bag is rejected');
select test.eq(test.stock(:'eggs') ->> 'amount', '6', 'a cancelled bag entry adds no stock');

-- The expiry rule at unpack
create function pg_temp.unpacked(p_name text, p_amount numeric, p_bb date, p_given date) returns date
language plpgsql as $$
declare
  v_ann  uuid := test.id('user:c-ann');
  v_h    uuid := private.household_of(test.id('user:c-ann'));
  v_item uuid;
begin
  v_item := test.item(v_ann, v_h, p_name, p_amount, 1, p_bb);
  perform test.apply(v_ann, jsonb_build_array(test.cmd('tick', v_h, v_item,
    jsonb_build_object('bag_id', test.id('bag:' || p_name), 'qty', 1, 'from_list', 1))));
  perform test.apply(v_ann, jsonb_build_array(test.cmd('unpack', v_h, v_item,
    jsonb_strip_nulls(jsonb_build_object('bag_id', test.id('bag:' || p_name), 'best_before', p_given)))));
  return (test.stock(v_item) ->> 'best_before')::date;
end;
$$;
select test.eq(pg_temp.unpacked('x1', 0, '2026-10-01', '2026-11-25'), '2026-11-25'::date, 'expiry: empty stock takes the new date');
select test.eq(pg_temp.unpacked('x2', 2, '2026-11-20', '2026-11-25'), '2026-11-20'::date, 'expiry: stock keeps the sooner old date');
select test.eq(pg_temp.unpacked('x3', 2, '2026-11-20', '2026-11-18'), '2026-11-18'::date, 'expiry: a sooner new date wins');
select test.eq(pg_temp.unpacked('x4', 2, null, '2026-11-25'), '2026-11-25'::date, 'expiry: undated stock takes the date');
select test.eq(pg_temp.unpacked('x5', 2, '2026-11-20', null), '2026-11-20'::date, 'expiry: no date leaves stock''s date');
select test.eq(pg_temp.unpacked('x6', 0, '2026-10-01', null), null::date, 'expiry: no date into empty stock clears it');

-- Membership and malformed input
select test.cmd('use', :'h', :'milk', '{"qty": 1, "waste": false}', test.id('c-cat-use')) as cat_use \gset
select test.eq(test.result(test.apply(:'cat', jsonb_build_array(:'cat_use'::jsonb))), 'not_member',
               'a command addressed to another household is rejected');
select test.eq((select jsonb_build_object('household', household_id, 'actor', actor = :'cat'::uuid)
                  from public.rejected_commands where command_id = test.id('c-cat-use')),
               '{"household": null, "actor": true}'::jsonb,
               'a not_member rejection is recorded outside the target household');
select test.eq(test.result(test.apply(:'cat', jsonb_build_array(test.cmd('use', :'hc', :'milk', '{"qty": 1, "waste": false}')))),
               'not_found', 'an item from another household is not found in yours');
select test.eq(test.stock(:'milk') ->> 'amount', '11', 'outsiders changed nothing');

select count(*) as rejected_before from public.rejected_commands \gset
select test.eq(test.apply(:'ann', '[{"kind": "use", "qty": 1}]') -> 'results',
               '[{"id": null, "status": "rejected", "reason": "malformed"}]'::jsonb,
               'a command with no id is rejected as malformed');
select test.eq((select count(*) from public.rejected_commands), :'rejected_before'::bigint,
               'a malformed command leaves no receipt, since it has no id to key one');
select test.eq(test.result(test.apply(:'ann', jsonb_build_array(test.cmd('create', :'h', test.id('c-badtag'), jsonb_build_object(
                 'item', '{"name": "Bad", "aliases": [], "tags": [{"kind": "aisle", "name": "3"}], "unit": "count", "default_amount": 1, "shelf_life_days": null}'::jsonb,
                 'start', '{}'::jsonb))))), 'invalid', 'a tag kind outside place, store and other is invalid');
select test.eq(test.result(test.apply(:'ann', jsonb_build_array(test.cmd('use', :'h', :'milk', '{"qty": "NaN", "waste": false}')))),
               'invalid', 'a non-number quantity is invalid');

begin;
select test.act_as(:'ann');
select test.throws(format('select public.apply_commands(%L)',
                          (select jsonb_agg(test.cmd('dismiss', :'h', :'milk')) from generate_series(1, 51))),
                   '22023', 'a batch over 50 commands is refused whole');
rollback;
begin;
set local role authenticated;
select test.throws('select public.apply_commands(''[]'')', '28000', 'apply_commands needs a signed-in user');
rollback;
