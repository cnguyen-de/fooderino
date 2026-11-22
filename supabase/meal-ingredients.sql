-- Ingredients added to a meal without a recipe. Apply after cook.sql; safe to run again.
--
-- A meal is every live cooked_recipes and meal_ingredients row sharing a date. The entries live
-- in their own table rather than as cooked_recipes rows with no recipe: a client parses every
-- pulled row, so a null recipe_id would stop sync on a phone still running the older client,
-- which never pulls a table it does not know.
begin;

create table if not exists public.meal_ingredients (
  id           uuid primary key,
  household_id uuid not null references public.households(id),
  date         date not null,
  -- One recipe ingredient. A null qty means used, but too little to count.
  ingredient   jsonb not null check (private.ingredients_valid(jsonb_build_array(ingredient))),
  uses         uuid[] not null default '{}' check (array_position(uses, null) is null),
  seq          bigint not null default 0,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists meal_ingredients_pull on public.meal_ingredients (household_id, seq);

create or replace trigger meal_ingredients_seq before insert on public.meal_ingredients
  for each row execute function private.stamp_seq('household_id');
create or replace trigger meal_ingredients_lww before update on public.meal_ingredients
  for each row execute function private.stamp_lww('household_id');
create or replace trigger meal_ingredients_lock before insert or update on public.meal_ingredients
  for each statement execute function private.lock_caller_household();

revoke all on public.meal_ingredients from anon, authenticated;
grant select on public.meal_ingredients to authenticated;
grant insert (id, household_id, date, ingredient, uses, updated_at, deleted_at),
      update (id, household_id, date, ingredient, uses, updated_at, deleted_at)
  on public.meal_ingredients to authenticated;

alter table public.meal_ingredients enable row level security;

drop policy if exists "members read meal ingredients" on public.meal_ingredients;
create policy "members read meal ingredients" on public.meal_ingredients
  for select to authenticated using (household_id = (select public.my_household()));
drop policy if exists "members add meal ingredients" on public.meal_ingredients;
create policy "members add meal ingredients" on public.meal_ingredients
  for insert to authenticated with check (household_id = (select public.my_household()));
drop policy if exists "members edit meal ingredients" on public.meal_ingredients;
create policy "members edit meal ingredients" on public.meal_ingredients
  for update to authenticated
  using (household_id = (select public.my_household())) with check (household_id = (select public.my_household()));

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meal_ingredients') then
    alter publication supabase_realtime add table public.meal_ingredients;
  end if;
end;
$$;

commit;
