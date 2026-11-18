-- supabase/verify-v2.sql
-- Run after supabase/cook.sql and supabase/backfill-v2.sql. Read-only. The DO block raises
-- 'verify-v2 failed: ...' naming every failed gate; otherwise it reports
-- 'verify-v2: all gates pass'. The queries after it are context for the
-- operator, not gates.

do $$
declare
  v_failed text[] := '{}';
  v_moves  boolean := exists (select 1 from public.household_moves);
  v_stray  bigint;
begin
  if not exists (select 1 from public.migration_runs where version = 'v2') then
    v_failed := v_failed || 'migration_runs has no v2 row'::text;
  end if;

  -- Every legacy list became a household, null admins included.
  if exists (select 1 from public.lists l
              where not exists (select 1 from public.households h
                                 where h.id = private.legacy_household(l) and h.legacy_id = l.uid))
     or (select count(*) from public.lists)
        <> (select count(*) from public.households where legacy_id is not null) then
    v_failed := v_failed || 'households do not equal lists'::text;
  end if;

  -- Every census entry landed as a member or a candidate of its household.
  if exists (select 1 from private.legacy_census() c
              where not exists (select 1 from public.household_members m
                                 where m.household_id = c.household_id and m.email = c.email)
                and not exists (select 1 from public.household_candidates k
                                 where k.household_id = c.household_id and k.email = c.email)) then
    v_failed := v_failed || 'a census email is neither a member nor a candidate'::text;
  end if;

  -- Exact while no live move has run: census = members + candidates.
  if not v_moves and (select count(*) from private.legacy_census())
       <> (select count(*) from public.household_members)
        + (select count(*) from public.household_candidates) then
    v_failed := v_failed || 'census does not equal members plus candidates'::text;
  end if;

  if exists (select 1 from public.household_members m
               join public.household_candidates k on k.email = m.email
              where m.deleted_at is null and k.consumed_at is null) then
    v_failed := v_failed || 'an email is both a live member and an open candidate'::text;
  end if;

  if exists (select user_id from public.household_members
              where deleted_at is null and user_id is not null
              group by user_id having count(*) > 1)
     or exists (select lower(email) from public.household_members
                 where deleted_at is null
                 group by lower(email) having count(*) > 1) then
    v_failed := v_failed || 'a user has more than one live membership'::text;
  end if;

  if (select count(*) from public.items i join public.lists l on l.id = i.list_id)
     <> (select count(*) from public.items_v2 where legacy_id is not null) then
    v_failed := v_failed || 'items on a list do not equal backfilled items'::text;
  end if;

  if (select count(*) from public.logs)
     <> (select count(*) from public.item_events where origin = 'backfill')
      + (select count(*) from public.legacy_log_audit) then
    v_failed := v_failed || 'logs do not equal backfilled events plus audit'::text;
  end if;

  if to_regclass('public.recipes_v2') is null then
    select count(*) into v_stray
      from public.recipes r
      join public.household_members m on m.user_id = r.id and m.deleted_at is null
     where r.saved and private.tidy(r.name) <> ''
       and not exists (select 1 from public.household_recipes h where h.id = private.uuid_for('recipe:' || r.index));
  else
    execute $q$
      select count(*) from public.recipes_v2 r
        join public.household_members m on m.user_id = r.user_id and m.deleted_at is null
       where r.saved and r.deleted_at is null and private.tidy(r.name) <> ''
         and not exists (select 1 from public.household_recipes h where h.id = r.id)
    $q$ into v_stray;
  end if;
  if v_stray > 0 then
    v_failed := v_failed || format('%s saved recipe(s) of housed owners are not household recipes; '
                                   'on a hosted database run select private.adopt_recipes_v2()', v_stray);
  end if;

  -- The clock is the pull cursor: it must be at or past every seq it issued.
  if exists (
    select 1 from public.households h
      left join public.household_clocks c on c.household_id = h.id
     where c.position is null
        or c.position < greatest(
             h.seq,
             (select max(seq) from public.items_v2 where household_id = h.id),
             (select max(seq) from public.household_members where household_id = h.id),
             (select max(seq) from public.item_events where household_id = h.id),
             (select max(seq) from public.bag_entries where household_id = h.id),
             (select max(seq) from public.command_log where household_id = h.id),
             (select max(seq) from public.household_recipes where household_id = h.id),
             (select max(seq) from public.cooked_recipes where household_id = h.id))) then
    v_failed := v_failed || 'a household clock is behind its rows'::text;
  end if;

  if cardinality(v_failed) > 0 then
    raise exception 'verify-v2 failed: %', array_to_string(v_failed, '; ');
  end if;
  raise notice 'verify-v2: all gates pass';
end;
$$;

-- Context: legacy items with no list to land on (null or dangling list_id).
select 'item without a list' as excluded, i.id, i.name, i.list_id
  from public.items i
 where not exists (select 1 from public.lists l where l.id = i.list_id);

-- Context: recipes with no owner.
select 'recipe without a user' as excluded, r.index, r.name
  from public.recipes r where r.id is null;

select 'recipe whose owner has no household' as excluded, r.index, r.name
  from public.recipes r
 where r.saved and r.id is not null
   and not exists (select 1 from public.household_members m where m.user_id = r.id and m.deleted_at is null);

-- Context: why legacy logs did not become events.
select reason, count(*) from public.legacy_log_audit group by reason order by reason;

-- Context: census entries skipped for want of an email, and admins with no auth row.
select 'users entry without email' as skipped, l.uid, u as entry
  from public.lists l
 cross join lateral jsonb_array_elements(
   case when jsonb_typeof(l.users) = 'array' then l.users else '[]'::jsonb end) u
 where coalesce(btrim(u ->> 'email'), '') = '';
select 'admin without auth row' as skipped, l.uid, l.admin
  from public.lists l
 where l.admin is not null and not exists (select 1 from auth.users au where au.id = l.admin);

-- Context: rows waiting for their person's first sign-in.
select 'email-only' as waiting, 'member' as kind, email from public.household_members where user_id is null
union all
select 'email-only', 'candidate', email from public.household_candidates where user_id is null;

-- Context: legacy values that were changed rather than copied.
select 'kg converted to gram' as changed, id, name, amount from public.items where amount_type::text = 'kg'
union all
select 'negative raised to 0', id, name, amount from public.items where amount < 0 or amount_to_purchase < 0;
