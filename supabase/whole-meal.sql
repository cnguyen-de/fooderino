-- Recipes that are a whole meal on their own, such as pho. Apply after cook.sql; safe to run again.
--
-- The client reads `kind = 'dish', whole_meal = true` as a one-dish meal. It is a column rather than
-- a third kind: a client parses every pulled row, so an unknown kind would stop sync on a phone still
-- running the older client, which sees the recipe as a plain dish instead.
begin;

alter table public.household_recipes add column if not exists whole_meal boolean not null default false;

grant insert (id, household_id, name, kind, whole_meal, ingredients, instructions, updated_at, deleted_at),
      update (id, household_id, name, kind, whole_meal, ingredients, instructions, updated_at, deleted_at)
  on public.household_recipes to authenticated;

commit;
