\o /dev/null

select test.user('w-ann') as ann, test.user('w-ben') as ben \gset
select test.household(:'ann', 'Whole Ann') as ha \gset
select test.household(:'ben', 'Whole Ben') as hb \gset

begin;
select test.act_as(:'ann');
insert into public.household_recipes (id, household_id, name, kind, whole_meal, ingredients, instructions, updated_at)
values (test.id('w-pho'), :'ha', 'Pho', 'dish', true, '[]', '', now())
on conflict (id) do update set name = excluded.name, kind = excluded.kind, whole_meal = excluded.whole_meal,
  updated_at = excluded.updated_at;
insert into public.household_recipes (id, household_id, name, kind, ingredients, instructions, updated_at)
values (test.id('w-rau'), :'ha', 'Rau muong', 'dish', '[]', '', now());
select test.throws(format('insert into public.household_recipes (id, household_id, name, whole_meal) values (%L, %L, %L, null)',
                          gen_random_uuid(), :'ha', 'Bun'), '23502', 'a recipe is a whole meal or not, never null');
commit;
select test.eq((select string_agg(name || '/' || whole_meal, ',' order by name) from public.household_recipes where household_id = :'ha'),
               'Pho/true,Rau muong/false', 'a member saves a whole-meal recipe, and one saved without the column is not one');

select updated_at as at_before from public.household_recipes where id = test.id('w-pho') \gset
begin;
select test.act_as(:'ann');
insert into public.household_recipes (id, household_id, name, kind, ingredients, instructions, updated_at, deleted_at)
values (test.id('w-pho'), :'ha', 'Pho bo', 'dish', '[]', '', :'at_before'::timestamptz + interval '1 minute', null)
on conflict (id) do update set id = excluded.id, household_id = excluded.household_id, name = excluded.name,
  kind = excluded.kind, ingredients = excluded.ingredients, instructions = excluded.instructions,
  updated_at = excluded.updated_at, deleted_at = excluded.deleted_at;
commit;
select test.eq((select name || '/' || whole_meal from public.household_recipes where id = test.id('w-pho')), 'Pho bo/true',
               'an older client''s sheet, which names no whole_meal, renames the recipe and keeps it a whole meal');

begin;
select test.act_as(:'ben');
update public.household_recipes set whole_meal = false, updated_at = now() + interval '1 hour' where id = test.id('w-pho');
commit;
select test.ok((select whole_meal from public.household_recipes where id = test.id('w-pho')),
               'another household cannot change whether the recipe is a whole meal');
