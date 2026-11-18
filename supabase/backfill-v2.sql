-- supabase/backfill-v2.sql
-- One-shot migration from the legacy tables into the v2 household schema.
-- Run after schema-v2.sql and cook.sql, with legacy writes frozen. It is guarded by
-- migration_runs: once version 'v2' is recorded, a rerun changes nothing, so
-- candidates consumed by a pick are never re-derived. Every id is
-- deterministic (private.uuid_for), so the rows are the same on any run.
--
-- Legacy schema evidence: the real production schema, supplied by the owner
-- (application-code inference had gotten `lists.id` / `logs.id` wrong):
--   lists   uid int8 PK, created_at timestamptz, name text, id uuid UNIQUE,
--           users jsonb, admin uuid NULL
--   items   id int8 PK, list_id uuid, name, location, store, amount,
--           amount_to_purchase, amount_type (enum AmountType: gram | kg | count),
--           default_amount, best_before date, "user" text, created_at, last_updated
--   logs    id uuid PK, created_at, list_id uuid, item text, "user" text,
--           payload text, action text
--   recipes index int8 PK, created_at, id uuid (holds the USER's id), name,
--           description, ingredients jsonb, instructions, saved
-- The legacy `users` and `settings` tables hold only per-user preferences and
-- the AI quota, none of which v2 carries.

-- The legacy logs table is readable with the anon key, emails included.
-- Legacy writes are frozen by now, so close it until drop-legacy.sql.
alter table public.logs enable row level security;

-- Rows for a person with no auth.users row yet are claimed when they first
-- sign in. Created before the census so a signup during the run is claimed.
create or replace function private.claim_household_rows() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.household_members
     set user_id = new.id, updated_at = now()
   where user_id is null and deleted_at is null and email = lower(btrim(new.email));
  update public.household_candidates
     set user_id = new.id
   where user_id is null and email = lower(btrim(new.email));
  return new;
end;
$$;
revoke all on function private.claim_household_rows() from public;

drop trigger if exists claim_memberships_on_signup on auth.users;
create trigger claim_memberships_on_signup
after insert on auth.users
for each row execute function private.claim_household_rows();

-- The household a legacy list becomes. A list with no uuid gets a minted one.
create or replace function private.legacy_household(p_list public.lists) returns uuid
language sql immutable set search_path = ''
as $$
  select coalesce(p_list.id, private.uuid_for('list:' || p_list.uid))
$$;

-- Who could see which list: every email in lists.users plus the admin's
-- email, one row per (household, email). verify-v2.sql reuses it.
create or replace function private.legacy_census()
returns table (household_id uuid, email text, name text, avatar text, is_admin boolean)
language sql stable set search_path = ''
as $$
  with entries as (
    select private.legacy_household(l) as household_id,
           lower(btrim(u ->> 'email')) as email,
           u ->> 'name' as name,
           u ->> 'avatar' as avatar,
           coalesce(u -> 'admin' = 'true'::jsonb, false) as is_admin,
           0 as source
      from public.lists l
     cross join lateral jsonb_array_elements(
       case when jsonb_typeof(l.users) = 'array' then l.users else '[]'::jsonb end) u
     where jsonb_typeof(u) = 'object' and coalesce(btrim(u ->> 'email'), '') <> ''
    union all
    select private.legacy_household(l), lower(btrim(au.email)),
           coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name'),
           coalesce(au.raw_user_meta_data ->> 'picture', au.raw_user_meta_data ->> 'avatar_url'),
           true, 1
      from public.lists l
      join auth.users au on au.id = l.admin
     where coalesce(btrim(au.email), '') <> ''
  )
  select household_id, email,
         (array_agg(name order by source) filter (where name is not null))[1],
         (array_agg(avatar order by source) filter (where avatar is not null))[1],
         bool_or(is_admin)
    from entries
   group by household_id, email
$$;
revoke all on function private.legacy_census() from public;

do $$
declare
  v_counts jsonb;
begin
  lock table public.migration_runs in exclusive mode;
  if exists (select 1 from public.migration_runs where version = 'v2') then
    raise notice 'backfill-v2: already applied, nothing to do';
    return;
  end if;

  -- 1. Every legacy list becomes a household with the same id, including
  --    lists with a null admin.
  insert into public.households (id, legacy_id, name, updated_at)
  select private.legacy_household(l), l.uid,
         coalesce(nullif(private.tidy(l.name), ''), 'Household'),
         coalesce(l.created_at, now())
    from public.lists l;

  -- 2. Census. An email in exactly one list becomes a member; an email in
  --    several lists becomes one candidate row per list and no membership.
  create temp table census on commit drop as
  select c.*, count(*) over (partition by c.email) as lists,
         (select au.id from auth.users au
           where lower(btrim(au.email)) = c.email
           order by au.created_at, au.id limit 1) as user_id
    from private.legacy_census() c;

  insert into public.household_members (id, household_id, user_id, email, name, avatar, role)
  select private.uuid_for('member:' || household_id || ':' || email), household_id, user_id, email,
         name, avatar, case when is_admin then 'admin' else 'member' end
    from census where lists = 1;

  insert into public.household_candidates (id, household_id, user_id, email, name, avatar, role)
  select private.uuid_for('candidate:' || household_id || ':' || email), household_id, user_id, email,
         name, avatar, case when is_admin then 'admin' else 'member' end
    from census where lists > 1;

  -- 3. Items. location and store become place and store tags. kg becomes
  --    gram, since v2 units are count | gram. Counters are copied, with
  --    negatives raised to 0 because v2 never holds negative stock.
  insert into public.items_v2 (id, household_id, legacy_id, name, tags, unit, default_amount,
                               amount, to_buy, best_before, updated_at)
  select private.uuid_for('item:' || i.id), h.id, i.id,
         coalesce(nullif(private.tidy(i.name), ''), 'Item ' || i.id),
         private.normalize_tags(jsonb_build_array(
           jsonb_build_object('kind', 'place', 'name', coalesce(i.location, '')),
           jsonb_build_object('kind', 'store', 'name', coalesce(i.store, '')))),
         case when i.amount_type::text in ('gram', 'kg') then 'gram' else 'count' end,
         greatest(coalesce(i.default_amount, 1), 0) * f.factor,
         greatest(coalesce(i.amount, 0), 0) * f.factor,
         greatest(coalesce(i.amount_to_purchase, 0), 0) * f.factor,
         i.best_before,
         coalesce(i.last_updated, i.created_at, now())
    from public.items i
    join public.households h on h.id = i.list_id
   cross join lateral (select case when i.amount_type::text = 'kg' then 1000 else 1 end as factor) f;

  -- 4. Legacy logs. A row becomes an event only when its action is
  --    'updated' or 'inventory', its payload is exactly "a → b" (or "a -> b"),
  --    a <> b, and its item name matches exactly one item of the list.
  --    Every other row goes to legacy_log_audit with the first failing reason.
  -- Normalize each item once. Repeating normalization for every log/item
  -- pair makes a real household's history exceed the SQL editor timeout.
  create temp table item_matches on commit drop as
  select household_id, private.norm_name(name) as name,
         array_agg(id order by id) as matches
    from public.items_v2
   group by household_id, private.norm_name(name);
  create unique index on item_matches (household_id, name);
  analyze item_matches;

  create temp table parsed on commit drop as
  select g.id, g.created_at, g.item, g.action, g.payload, h.id as household_id,
         (regexp_match(g.payload, '^\s*(-?\d+(\.\d+)?)\s*(→|->)\s*(-?\d+(\.\d+)?)\s*$')) as m,
         coalesce(im.matches, '{}'::uuid[]) as matches,
         (select au.id from auth.users au
           where lower(btrim(au.email)) = lower(btrim(g."user"))
           order by au.created_at, au.id limit 1) as actor
    from public.logs g
    left join public.households h on h.id = g.list_id
    left join item_matches im on im.household_id = h.id and im.name = private.norm_name(g.item);

  create temp table classified on commit drop as
  select p.*,
         case
           when p.household_id is null then 'no_household'
           when p.action is null or p.action not in ('updated', 'inventory') then 'action'
           when p.m is null then 'unparseable'
           when p.m[1]::numeric = p.m[4]::numeric then 'no_change'
           when cardinality(p.matches) = 0 then 'no_match'
           when cardinality(p.matches) > 1 then 'ambiguous'
         end as reason
    from parsed p;

  insert into public.item_events (id, household_id, item_id, kind, qty, after, occurred_at, actor, origin)
  select c.id, c.household_id, c.matches[1],
         case when b > a then 'purchase' else 'consume' end,
         abs(b - a) * f.factor,
         case when b < a then to_jsonb(b * f.factor) end,
         coalesce(c.created_at, now()), c.actor, 'backfill'
    from classified c
   cross join lateral (select c.m[1]::numeric as a, c.m[4]::numeric as b) n
   cross join lateral (
     select case when li.amount_type::text = 'kg' then 1000 else 1 end as factor
       from public.items_v2 i join public.items li on li.id = i.legacy_id
      where i.id = c.matches[1]) f
   where c.reason is null;

  insert into public.legacy_log_audit (log_id, household_id, item, action, payload, logged_at, reason)
  select id, household_id, item, action, payload, created_at, reason
    from classified where reason is not null;

  -- 5. Saved recipes move to their owner's household, as cook.sql's adopt_recipes_v2 does on
  -- a database that went through recipes_v2. An owner with no single household keeps none.
  insert into public.household_recipes (id, household_id, name, ingredients, instructions, updated_at)
  select private.uuid_for('recipe:' || r.index), m.household_id, private.tidy(r.name),
         private.legacy_ingredients(r.ingredients),
         concat_ws(E'\n\n', nullif(btrim(r.description), ''), nullif(btrim(r.instructions), '')),
         coalesce(r.created_at, now())
    from public.recipes r
    join public.household_members m on m.user_id = r.id and m.deleted_at is null
   where r.saved and private.tidy(r.name) <> '';

  insert into public.migration_runs (version) values ('v2');

  select jsonb_build_object(
    'households', (select count(*) from public.households),
    'members',    (select count(*) from public.household_members),
    'candidates', (select count(*) from public.household_candidates),
    'items',      (select count(*) from public.items_v2),
    'events',     (select count(*) from public.item_events),
    'audit',      (select count(*) from public.legacy_log_audit),
    'recipes',    (select count(*) from public.household_recipes)) into v_counts;
  raise notice 'backfill-v2: applied %', v_counts;
end;
$$;
