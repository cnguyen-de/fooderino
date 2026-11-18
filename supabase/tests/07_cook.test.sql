\o /dev/null

select test.user('k-ann') as ann, test.user('k-ben') as ben, test.user('k-cat') as cat \gset
select test.household(:'ann', 'Cook Ann') as ha \gset
select test.household(:'ben', 'Cook Ben') as hb \gset

-- Recipe documents
begin;
select test.act_as(:'ann');
insert into public.household_recipes (id, household_id, name, kind, ingredients, instructions, updated_at)
values (test.id('k-soup'), :'ha', 'Canh chua', 'soup',
        jsonb_build_array(
          jsonb_build_object('name', 'Tamarind', 'item_id', null, 'qty', jsonb_build_object('amount', 2, 'unit', 'count')),
          jsonb_build_object('name', 'Fish', 'item_id', test.id('k-fish-item'), 'qty', jsonb_build_object('amount', 300, 'unit', 'gram')),
          jsonb_build_object('name', 'Herbs', 'item_id', null, 'qty', null)),
        'Boil.', now())
on conflict (id) do update set name = excluded.name, kind = excluded.kind, ingredients = excluded.ingredients,
  instructions = excluded.instructions, updated_at = excluded.updated_at;
select test.throws(format('insert into public.household_recipes (id, household_id, name, ingredients) values (%L, %L, %L, %L)',
                          gen_random_uuid(), :'ha', 'Bad', i), '23514', 'ingredients ' || i || ' are refused')
  from unnest(array['{}', '[{"name": "  ", "item_id": null, "qty": null}]',
                    '[{"name": "x", "item_id": null, "qty": {"amount": 0, "unit": "count"}}]',
                    '[{"name": "x", "item_id": null, "qty": {"amount": 1}}]',
                    '[{"name": "x", "item_id": null, "qty": {"amount": 1, "unit": "kg"}}]',
                    '[{"name": "x", "item_id": "milk", "qty": null}]',
                    '[{"name": "x", "item_id": null, "qty": null, "note": "y"}]']) i;
select test.throws(format('insert into public.household_recipes (id, household_id, name, kind) values (%L, %L, %L, %L)',
                          gen_random_uuid(), :'ha', 'Snack', 'snack'), '23514', 'a recipe is a dish or a soup');
select test.throws(format('insert into public.household_recipes (id, household_id, name) values (%L, %L, %L)',
                          gen_random_uuid(), :'ha', E' \t '), '23514', 'a recipe needs a name');
commit;
select test.eq((select kind || '/' || jsonb_array_length(ingredients) from public.household_recipes where id = test.id('k-soup')),
               'soup/3', 'a member saves a soup with linked, typed and unmeasured ingredients');

-- Last write wins
select seq as seq_before, updated_at as at_before from public.household_recipes where id = test.id('k-soup') \gset
begin;
select test.act_as(:'ann');
insert into public.household_recipes (id, household_id, name, updated_at)
values (test.id('k-soup'), :'ha', 'Canh chua cá', :'at_before'::timestamptz + interval '1 minute')
on conflict (id) do update set name = excluded.name, updated_at = excluded.updated_at;
update public.household_recipes set name = 'Older sheet', updated_at = :'at_before'::timestamptz - interval '1 day'
 where id = test.id('k-soup');
select test.throws(format('update public.household_recipes set household_id = %L where id = %L', :'hb', test.id('k-soup')),
                   '42501', 'a recipe cannot move to another household');
commit;
select test.eq((select name from public.household_recipes where id = test.id('k-soup')), 'Canh chua cá',
               'stamp_lww keeps the newer recipe sheet and drops the older one');
select test.ok((select seq from public.household_recipes where id = test.id('k-soup')) > :'seq_before'::bigint,
               'an accepted recipe write takes a new seq');

-- Cooked dishes
begin;
select test.act_as(:'ann');
insert into public.cooked_recipes (id, household_id, recipe_id, date, uses, updated_at)
values (test.id('k-dinner'), :'ha', test.id('k-soup'), '2026-11-18', array[test.id('k-use')], now())
on conflict (id) do update set date = excluded.date, uses = excluded.uses, updated_at = excluded.updated_at;
update public.cooked_recipes set deleted_at = now(), updated_at = now() + interval '1 minute' where id = test.id('k-dinner');
commit;
select test.eq((select uses = array[test.id('k-use')] and deleted_at is not null from public.cooked_recipes where id = test.id('k-dinner')),
               true, 'a member records a cooked dish with its use commands and removes it by tombstone');

begin;
select test.act_as(:'ben');
insert into public.household_recipes (id, household_id, name) values (test.id('k-ben-dish'), :'hb', 'Thịt kho');
commit;
begin;
select test.act_as(:'ann');
select test.throws(format('insert into public.cooked_recipes (id, household_id, recipe_id, date) values (%L, %L, %L, current_date)',
                          gen_random_uuid(), :'ha', test.id('k-ben-dish')),
                   '23503', 'a cooked dish cannot point at another household''s recipe');
select test.throws(format('insert into public.cooked_recipes (id, household_id, recipe_id, date, uses) values (%L, %L, %L, current_date, %L)',
                          gen_random_uuid(), :'ha', test.id('k-soup'), '{NULL}'),
                   '23514', 'a NULL use command is refused');
commit;
select test.throws(format('insert into public.cooked_recipes (id, household_id, recipe_id, date) values (%L, %L, %L, current_date)',
                          gen_random_uuid(), :'ha', test.id('k-ben-dish')),
                   '23503', 'the household foreign key holds even where RLS does not apply');

-- Legacy ingredients: the same fixture pins utils/db-upgrade.ts legacyIngredients
\set fixture `cat /repo/tests/fixtures/legacy-ingredients.json`
select test.eq(private.legacy_ingredients(c -> 'legacy'), c -> 'ingredients', 'legacy ingredients: ' || (c ->> 'case'))
  from jsonb_array_elements(:'fixture'::jsonb) c;
select test.ok(bool_and(private.ingredients_valid(c -> 'ingredients')), 'every converted legacy list is a valid recipe list')
  from jsonb_array_elements(:'fixture'::jsonb) c;

-- Moving recipes_v2, as on the hosted database
begin;
create table public.recipes_v2 (
  id           uuid primary key,
  user_id      uuid not null,
  name         text not null,
  description  text,
  ingredients  jsonb not null default '[]'::jsonb,
  instructions text,
  saved        boolean not null default false,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
insert into public.recipes_v2 (id, user_id, name, description, ingredients, instructions, saved, updated_at, deleted_at) values
  (test.id('k-v2-bun'), :'ann', ' Bún   chả ', 'Hanoi style', '[{"name": "Pork", "amount": 0.5, "amount_type": "kg"}]', 'Grill.', true, '2026-10-01', null),
  (test.id('k-v2-gone'), :'ann', 'Gone', null, '[]', null, true, '2026-10-01', '2026-10-02'),
  (test.id('k-v2-ai'), :'ann', 'AI idea', null, '[]', null, false, '2026-10-01', null),
  (test.id('k-v2-ben'), :'ben', 'Phở', null, '[{"name": "Noodles"}]', null, true, '2026-10-03', null),
  (test.id('k-v2-cat'), :'cat', 'Cat soup', null, '[]', null, true, '2026-10-04', null);

select private.adopt_recipes_v2() as first_run \gset
select test.eq(:'first_run'::jsonb, '{"moved": 2, "left_behind": 1}'::jsonb,
               'adopt moves saved, live recipes of housed owners and counts the rest');
select test.eq((select jsonb_build_object('household', household_id, 'name', name, 'kind', kind, 'ingredients', ingredients,
                                          'instructions', instructions, 'updated_at', updated_at)
                  from public.household_recipes where id = test.id('k-v2-bun')),
               jsonb_build_object('household', :'ha'::uuid, 'name', 'Bún chả', 'kind', 'dish',
                                  'ingredients', '[{"name": "Pork", "item_id": null, "qty": {"amount": 500, "unit": "gram"}}]'::jsonb,
                                  'instructions', E'Hanoi style\n\nGrill.', 'updated_at', '2026-10-01'::timestamptz),
               'a moved recipe keeps its id and stamp, with converted ingredients and the description folded in');
select test.eq((select household_id from public.household_recipes where id = test.id('k-v2-ben')), :'hb'::uuid,
               'each recipe lands in its own creator''s household');
select test.eq((select count(*) from public.household_recipes
                 where id in (test.id('k-v2-gone'), test.id('k-v2-ai'), test.id('k-v2-cat'))), 0::bigint,
               'deleted, unsaved and homeless recipes stay behind');
select md5(string_agg(to_jsonb(h)::text, ',' order by h.id)) as before_second from public.household_recipes h \gset
select test.eq(private.adopt_recipes_v2(), '{"moved": 0, "left_behind": 1}'::jsonb, 'a second adopt moves nothing');
select test.eq((select md5(string_agg(to_jsonb(h)::text, ',' order by h.id)) from public.household_recipes h), :'before_second',
               'a second adopt leaves household recipes byte-identical');
rollback;
