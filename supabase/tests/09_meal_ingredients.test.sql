\o /dev/null

select test.user('m-ann') as ann, test.user('m-ben') as ben \gset
select test.household(:'ann', 'Meal Ann') as ha \gset
select test.household(:'ben', 'Meal Ben') as hb \gset

begin;
select test.act_as(:'ann');
insert into public.meal_ingredients (id, household_id, date, ingredient, uses, updated_at)
values (test.id('m-tofu'), :'ha', '2026-11-20',
        jsonb_build_object('name', 'Tofu', 'item_id', test.id('m-tofu-item'), 'qty', jsonb_build_object('amount', 0.5, 'unit', 'count')),
        array[test.id('m-use')], now())
on conflict (id) do update set ingredient = excluded.ingredient, uses = excluded.uses, updated_at = excluded.updated_at;
insert into public.meal_ingredients (id, household_id, date, ingredient)
values (test.id('m-salt'), :'ha', '2026-11-20', '{"name": "Salt", "item_id": null, "qty": null}');
select test.throws(format('insert into public.meal_ingredients (id, household_id, date, ingredient) values (%L, %L, current_date, %L)',
                          gen_random_uuid(), :'ha', i), '23514', 'ingredient ' || i || ' is refused')
  from unnest(array['[]', '[{"name": "Salt", "item_id": null, "qty": null}]', 'null', '"Salt"',
                    '{"name": "  ", "item_id": null, "qty": null}',
                    '{"name": "x", "item_id": null, "qty": {"amount": 0, "unit": "count"}}',
                    '{"name": "x", "item_id": null, "qty": null, "note": "y"}']) i;
select test.throws(format('insert into public.meal_ingredients (id, household_id, date, ingredient, uses) values (%L, %L, current_date, %L, %L)',
                          gen_random_uuid(), :'ha', '{"name": "x", "item_id": null, "qty": null}', '{NULL}'),
                   '23514', 'a NULL use command is refused');
select test.throws(format('update public.meal_ingredients set seq = 0 where id = %L', test.id('m-tofu')),
                   '42501', 'a client cannot write a meal ingredient''s seq');
select test.throws(format('update public.meal_ingredients set household_id = %L where id = %L', :'hb', test.id('m-tofu')),
                   '42501', 'a meal ingredient cannot move to another household');
commit;
select test.eq((select count(*) from public.meal_ingredients where household_id = :'ha'), 2::bigint,
               'a member adds a measured and an unmeasured ingredient to a meal');

select seq as seq_before, updated_at as at_before from public.meal_ingredients where id = test.id('m-tofu') \gset
begin;
select test.act_as(:'ann');
update public.meal_ingredients set deleted_at = now(), updated_at = :'at_before'::timestamptz + interval '1 minute'
 where id = test.id('m-tofu');
update public.meal_ingredients set deleted_at = null, updated_at = :'at_before'::timestamptz - interval '1 day'
 where id = test.id('m-tofu');
commit;
select test.eq((select deleted_at is not null and seq > :'seq_before'::bigint from public.meal_ingredients where id = test.id('m-tofu')),
               true, 'a removal by tombstone takes a new seq and an older sheet does not undo it');

begin;
select test.act_as(:'ben');
select test.eq((select count(*) from public.meal_ingredients where household_id = :'ha'), 0::bigint,
               'another household cannot read the meal''s ingredients');
select test.throws(format('insert into public.meal_ingredients (id, household_id, date, ingredient) values (%L, %L, current_date, %L)',
                          gen_random_uuid(), :'ha', '{"name": "x", "item_id": null, "qty": null}'),
                   '42501', 'another household cannot add to the meal');
update public.meal_ingredients set deleted_at = null, updated_at = now() + interval '1 hour' where id = test.id('m-tofu');
commit;
select test.ok((select deleted_at is not null from public.meal_ingredients where id = test.id('m-tofu')),
               'another household cannot edit the meal''s ingredients');
