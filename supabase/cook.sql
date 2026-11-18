begin;

create function private.ingredients_valid(p jsonb) returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  v jsonb;
begin
  if jsonb_typeof(p) is distinct from 'array' then return false; end if;
  for v in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(v) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(v) k where k not in ('name', 'item_id', 'qty')) then return false; end if;
    if jsonb_typeof(v -> 'name') is distinct from 'string' or (v ->> 'name') !~ '\S' then return false; end if;
    if jsonb_typeof(v -> 'item_id') is distinct from 'null'
       and (jsonb_typeof(v -> 'item_id') is distinct from 'string'
            or (v ->> 'item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      return false;
    end if;
    if jsonb_typeof(v -> 'qty') is distinct from 'null' then
      if jsonb_typeof(v -> 'qty') <> 'object'
         or exists (select 1 from jsonb_object_keys(v -> 'qty') k where k not in ('amount', 'unit'))
         or jsonb_typeof(v -> 'qty' -> 'amount') is distinct from 'number'
         or (v -> 'qty' ->> 'amount')::numeric <= 0
         or (v -> 'qty' ->> 'unit') is null or (v -> 'qty' ->> 'unit') not in ('count', 'gram') then
        return false;
      end if;
    end if;
  end loop;
  return true;
end;
$$;

create function private.legacy_ingredients(p jsonb) returns jsonb
language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', private.tidy(e ->> 'name'),
           'item_id', null,
           'qty', case when jsonb_typeof(e -> 'amount') = 'number' and (e ->> 'amount')::numeric > 0
                       then jsonb_build_object(
                              'amount', (e ->> 'amount')::numeric * case when e ->> 'amount_type' = 'kg' then 1000 else 1 end,
                              'unit', case when e ->> 'amount_type' in ('gram', 'kg') then 'gram' else 'count' end)
                  end) order by n), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality as l(e, n)
   where jsonb_typeof(e) = 'object' and jsonb_typeof(e -> 'name') = 'string' and private.tidy(e ->> 'name') <> ''
$$;

create table public.household_recipes (
  id           uuid primary key,
  household_id uuid not null references public.households(id),
  name         text not null check (name ~ '\S'),
  kind         text not null default 'dish' check (kind in ('dish', 'soup')),
  ingredients  jsonb not null default '[]' check (private.ingredients_valid(ingredients)),
  instructions text not null default '',
  seq          bigint not null default 0,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (household_id, id)
);
create index household_recipes_pull on public.household_recipes (household_id, seq);

create table public.cooked_recipes (
  id           uuid primary key,
  household_id uuid not null references public.households(id),
  recipe_id    uuid not null,
  date         date not null,
  uses         uuid[] not null default '{}' check (array_position(uses, null) is null),
  seq          bigint not null default 0,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  -- RLS does not apply to a foreign key check, so the household is part of the key.
  foreign key (household_id, recipe_id) references public.household_recipes (household_id, id)
);
create index cooked_recipes_pull on public.cooked_recipes (household_id, seq);

create trigger household_recipes_seq before insert on public.household_recipes
  for each row execute function private.stamp_seq('household_id');
create trigger household_recipes_lww before update on public.household_recipes
  for each row execute function private.stamp_lww('household_id');
create trigger household_recipes_lock before insert or update on public.household_recipes
  for each statement execute function private.lock_caller_household();

create trigger cooked_recipes_seq before insert on public.cooked_recipes
  for each row execute function private.stamp_seq('household_id');
create trigger cooked_recipes_lww before update on public.cooked_recipes
  for each row execute function private.stamp_lww('household_id');
create trigger cooked_recipes_lock before insert or update on public.cooked_recipes
  for each statement execute function private.lock_caller_household();

revoke all on public.household_recipes, public.cooked_recipes from anon, authenticated;
grant select on public.household_recipes, public.cooked_recipes to authenticated;
grant insert (id, household_id, name, kind, ingredients, instructions, updated_at, deleted_at),
      update (id, household_id, name, kind, ingredients, instructions, updated_at, deleted_at)
  on public.household_recipes to authenticated;
grant insert (id, household_id, recipe_id, date, uses, updated_at, deleted_at),
      update (id, household_id, recipe_id, date, uses, updated_at, deleted_at)
  on public.cooked_recipes to authenticated;

alter table public.household_recipes enable row level security;
alter table public.cooked_recipes    enable row level security;

create policy "members read recipes" on public.household_recipes
  for select to authenticated using (household_id = (select public.my_household()));
create policy "members add recipes" on public.household_recipes
  for insert to authenticated with check (household_id = (select public.my_household()));
create policy "members edit recipes" on public.household_recipes
  for update to authenticated
  using (household_id = (select public.my_household())) with check (household_id = (select public.my_household()));

create policy "members read meals" on public.cooked_recipes
  for select to authenticated using (household_id = (select public.my_household()));
create policy "members add to meals" on public.cooked_recipes
  for insert to authenticated with check (household_id = (select public.my_household()));
create policy "members edit meals" on public.cooked_recipes
  for update to authenticated
  using (household_id = (select public.my_household())) with check (household_id = (select public.my_household()));

alter publication supabase_realtime add table public.household_recipes, public.cooked_recipes;

create function private.adopt_recipes_v2() returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_moved bigint;
  v_left  bigint;
begin
  insert into public.household_recipes (id, household_id, name, ingredients, instructions, updated_at)
  select r.id, m.household_id, private.tidy(r.name), private.legacy_ingredients(r.ingredients),
         concat_ws(E'\n\n', nullif(btrim(r.description), ''), nullif(btrim(r.instructions), '')),
         r.updated_at
    from public.recipes_v2 r
    join public.household_members m on m.user_id = r.user_id and m.deleted_at is null
   where r.saved and r.deleted_at is null and private.tidy(r.name) <> ''
  on conflict (id) do nothing;
  get diagnostics v_moved = row_count;
  select count(*) into v_left from public.recipes_v2 r
   where r.saved and r.deleted_at is null and private.tidy(r.name) <> ''
     and not exists (select 1 from public.household_recipes h where h.id = r.id);
  return jsonb_build_object('moved', v_moved, 'left_behind', v_left);
end;
$$;

-- household_recipes' CHECK calls this as the writing role.
grant execute on function private.ingredients_valid(jsonb) to authenticated;

do $$
begin
  if to_regclass('public.recipes_v2') is null then return; end if;
  raise notice 'cook.sql: %', private.adopt_recipes_v2();
  revoke insert, update on public.recipes_v2 from authenticated;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'recipes_v2') then
    alter publication supabase_realtime drop table public.recipes_v2;
  end if;
end;
$$;

commit;
