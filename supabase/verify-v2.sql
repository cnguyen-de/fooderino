-- supabase/verify-v2.sql
-- Run after supabase/backfill-v2.sql. Queries 1b, 2 and 3 must return `0`.
-- Queries 0, 1a, 4, 5 and 6 are informational context, not gates.

-- 0. Legacy lists excluded from the backfill because admin is null (lists_v2
--    requires a non-null owner). Informational, but explains any nonzero
--    lists/items delta in query 1a: every item and log on an excluded list is
--    dropped by the same inner join, since items_v2.list_id and
--    logs_v2.list_id are not-null FKs to lists_v2. Record the count and the
--    ids; a human should confirm none of them were meant to have an owner.
select count(*) as excluded_lists from lists where admin is null;
select uid, id, name from lists where admin is null;

-- 1a. Raw row-count deltas, for context alongside 1b. lists/items are NOT
--     expected to be 0 once ownerless-list exclusion is legitimate (see
--     query 0) — read 1b for the actual pass/fail signal.
select 'lists'   as t, (select count(*) from lists)   - (select count(*) from lists_v2)   as delta
union all select 'items',   (select count(*) from items)   - (select count(*) from items_v2)
union all select 'logs',    (select count(*) from logs)    - (select count(*) from logs_v2)
union all select 'recipes', (select count(*) from recipes) - (select count(*) from recipes_v2);

-- 1b. Same as 1a but with the legitimate ownerless-list shortfall subtracted
--     out. Expect 0. Any nonzero value here is a real, unexplained gap —
--     unlike 1a, this does not require mentally subtracting query 0's count.
select 'lists' as t,
       (select count(*) from lists) - (select count(*) from lists_v2)
         - (select count(*) from lists where admin is null) as unexplained
union all
select 'items',
       (select count(*) from items) - (select count(*) from items_v2)
         - (select count(*) from items i join lists l on l.id = i.list_id
             where l.admin is null);

-- 2. No orphaned items. Expect 0. (Structurally guaranteed by the not-null
--    FK items_v2.list_id -> lists_v2(id) if the backfill ran as written —
--    kept as a cheap sanity check, not as the primary orphan detector.)
select count(*) from items_v2 i
 where not exists (select 1 from lists_v2 l where l.id = i.list_id);

-- 3. Every legacy member email, on a list that was actually backfilled,
--    made it across. Expect 0. Restricted to admin-not-null lists because
--    members of an excluded list (query 0) have nowhere to land and are not
--    a backfill failure.
select count(*) from (
  select distinct lower(u->>'email') as email
  from lists l cross join lateral jsonb_array_elements(l.users) u
  where l.admin is not null
) legacy
where not exists (select 1 from list_members m where lower(m.email) = legacy.email);

-- 4. Members with no account yet — informational, not a failure.
--    These sync once they sign up (see the claim trigger in backfill-v2.sql).
select email from list_members where user_id is null;

-- 5. Lists with no member flagged admin in the legacy JSON array —
--    informational, not a failure. The real ownership gate is
--    lists_v2.owner (always set, since query 0 already excludes
--    admin-null lists). This only flags a data-quality gap: none of a
--    list's member entries had `admin: true`, independent of who its
--    actual owner is.
select l.id, l.name from lists_v2 l
 where not exists (
   select 1 from list_members m
    where m.list_id = l.id and m.role = 'admin' and m.deleted_at is null
 );

-- 6. Legacy member entries with no email — informational, not a failure.
--    The members backfill in backfill-v2.sql skips these (they cannot
--    satisfy list_members.email not null); this surfaces exactly which
--    ones were skipped, same principle as query 0 for ownerless lists.
select l.id as list_id, l.name, u as malformed_entry
from lists l cross join lateral jsonb_array_elements(l.users) u
where u->>'email' is null;
