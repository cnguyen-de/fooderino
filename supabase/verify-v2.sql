-- supabase/verify-v2.sql
-- All five must return the stated result before cutover (Task 13).
-- Run after supabase/backfill-v2.sql.

-- 1. Row counts match. Expect every `delta` column to be 0.
select 'lists'   as t, (select count(*) from lists)   - (select count(*) from lists_v2)   as delta
union all select 'items',   (select count(*) from items)   - (select count(*) from items_v2)
union all select 'logs',    (select count(*) from logs)    - (select count(*) from logs_v2)
union all select 'recipes', (select count(*) from recipes) - (select count(*) from recipes_v2);

-- 2. No orphaned items. Expect 0.
select count(*) from items_v2 i
 where not exists (select 1 from lists_v2 l where l.id = i.list_id);

-- 3. Every legacy member email made it across. Expect 0.
select count(*) from (
  select distinct lower(u->>'email') as email
  from lists l cross join lateral jsonb_array_elements(l.users) u
) legacy
where not exists (select 1 from list_members m where lower(m.email) = legacy.email);

-- 4. Members with no account yet — informational, not a failure.
--    These sync once they sign up (see the claim trigger in backfill-v2.sql).
select email from list_members where user_id is null;

-- 5. Every list has at least one admin. Expect 0.
select l.id, l.name from lists_v2 l
 where not exists (
   select 1 from list_members m
    where m.list_id = l.id and m.role = 'admin' and m.deleted_at is null
 );
