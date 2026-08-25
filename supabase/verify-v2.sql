-- supabase/verify-v2.sql
-- Run after supabase/backfill-v2.sql. Queries 1b, 2 and 3 must return `0`.
-- 1b is the pass/fail gate for all four tables (lists, items, logs,
-- recipes) — recipes has no legitimate exclusion at all, so its row must
-- be exactly 0 same as logs. Queries 0, 1a, 1c, 3b, 4 and 5 are
-- informational context, not gates.

-- 0. Legacy lists excluded from the backfill because admin is null (lists_v2
--    requires a non-null owner). Informational, but explains part of any
--    nonzero lists/items/logs delta in query 1a (subtracted out in 1b):
--    every item and log on an excluded list is dropped by the same inner
--    join, since items_v2.list_id and logs_v2.list_id are not-null FKs to
--    lists_v2 (query 1c has the other part — null/dangling list_id). Record
--    the count and the ids; a human should confirm none of them were meant
--    to have an owner.
select count(*) as excluded_lists from lists where admin is null;
select uid, id, name from lists where admin is null;

-- 1a. Raw row-count deltas, for context alongside 1b. lists/items/logs may
--     be nonzero here even on a correct backfill, once any legitimate
--     exclusion (ownerless list, null list_id, dangling list_id — see
--     query 0 and 1c) applies. This is context only, not a gate for any of
--     the four tables — 1b is the actual pass/fail signal for all of them,
--     recipes included.
select 'lists'   as t, (select count(*) from lists)   - (select count(*) from lists_v2)   as delta
union all select 'items',   (select count(*) from items)   - (select count(*) from items_v2)
union all select 'logs',    (select count(*) from logs)    - (select count(*) from logs_v2)
union all select 'recipes', (select count(*) from recipes) - (select count(*) from recipes_v2);

-- 1b. The pass/fail gate. Expect 0 in every row. Each table's raw delta has
--     its legitimate exclusions subtracted, so any residue is a real gap.
--     lists:   ownerless lists are excluded by the backfill (query 0).
--     items:   dropped if on an ownerless list, or if list_id is null or
--              dangling (query 1c).
--     logs:    same two exclusions as items.
--     recipes: no exclusion mechanism at all — this must be exactly 0.
select 'lists' as t,
       (select count(*) from lists) - (select count(*) from lists_v2)
         - (select count(*) from lists where admin is null) as unexplained
union all
select 'items',
       (select count(*) from items) - (select count(*) from items_v2)
         - (select count(*) from items i
             left join lists l on l.id = i.list_id
            where i.list_id is null or l.admin is null or l.id is null)
union all
select 'logs',
       (select count(*) from logs) - (select count(*) from logs_v2)
         - (select count(*) from logs g
             left join lists l on l.id = g.list_id
            where g.list_id is null or l.admin is null or l.id is null)
union all
select 'recipes',
       (select count(*) from recipes) - (select count(*) from recipes_v2);

-- 1c. Informational: items and logs the backfill drops for want of a usable
--     list (null list_id, list_id with no matching lists row, or list_id
--     pointing at an ownerless list). Explains the corresponding
--     subtraction in 1b.
select 'item' as kind, i.id::text as id, i.name as detail, i.list_id
from items i left join lists l on l.id = i.list_id
where i.list_id is null or l.admin is null or l.id is null
union all
select 'log', g.id::text, coalesce(g.item, '(no item)'), g.list_id
from logs g left join lists l on l.id = g.list_id
where g.list_id is null or l.admin is null or l.id is null;

-- 2. No orphaned items. Expect 0. (Structurally guaranteed by the not-null
--    FK items_v2.list_id -> lists_v2(id) if the backfill ran as written —
--    kept as a cheap sanity check, not as the primary orphan detector.)
select count(*) from items_v2 i
 where not exists (select 1 from lists_v2 l where l.id = i.list_id);

-- 3. Every legacy member email the backfill actually attempted made it
--    across. Expect 0. Restricted to admin-not-null lists (members of an
--    excluded list, per query 0, have nowhere to land) AND to non-null
--    emails (the backfill's own `u->>'email' is not null` guard skips
--    those, per query 3b below) — without the email filter, every null
--    email collapses under DISTINCT into one bogus "missing member" and
--    under-reports if there's more than one.
select count(*) from (
  select distinct lower(u->>'email') as email
  from lists l cross join lateral jsonb_array_elements(l.users) u
  where l.admin is not null and u->>'email' is not null
) legacy
where not exists (select 1 from list_members m where lower(m.email) = legacy.email);

-- 3b. Legacy member entries with no email — informational, not a failure.
--     The members backfill skips these (they cannot satisfy
--     list_members.email not null); this surfaces exactly which ones were
--     skipped, same principle as query 0 for ownerless lists, and is why
--     query 3 above excludes them rather than letting them corrupt the count.
select l.id as list_id, l.name, u as malformed_entry
from lists l cross join lateral jsonb_array_elements(l.users) u
where u->>'email' is null;

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
