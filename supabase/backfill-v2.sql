-- supabase/backfill-v2.sql
-- One-shot migration from the legacy tables. Re-runnable after truncating v2.
--
-- Legacy schema evidence: the real production schema, supplied directly by
-- the user after the team lead flagged that application-code inference had
-- gotten `lists.id` / `logs.id` wrong (both already uuid, not the numeric
-- key). See team-lead message "Real schema received — backfill assumptions
-- were wrong" for the authoritative column list per table:
--   lists   uid int8 PK, created_at timestamptz, name text, id uuid UNIQUE,
--           users jsonb, admin uuid NULL
--   items   id int8 PK, list_id uuid, name, location, store, amount,
--           amount_to_purchase, amount_type (enum AmountType), default_amount,
--           best_before date, "user" text, created_at, last_updated
--   logs    id uuid PK, created_at, list_id uuid, item text, "user" text,
--           payload text, action text
--   recipes index int8 PK, created_at, id uuid (holds the USER's id), name,
--           description, ingredients jsonb, instructions, saved
-- The legacy `users` and `settings` tables hold only per-user preferences and
-- the AI quota, none of which v2 carries, so neither is backfilled.
--
-- To re-run: truncate lists_v2 cascade; truncate recipes_v2;
-- then re-run this whole file. The cascade on lists_v2 clears list_members, items_v2,
-- item_ops and logs_v2 via their FKs.

begin;

-- lists.id is already a uuid and is what items/logs already point to via
-- list_id — reuse it as lists_v2.id rather than minting a new one, so no
-- remapping join is needed downstream. lists.uid (the numeric identity
-- column) becomes legacy_id purely for audit purposes.
--
-- admin is nullable in production but lists_v2.owner is not null. A list
-- with no admin has no valid owner to assign and is excluded here rather
-- than inserted with a fabricated one. See verify-v2.sql query 0 for the
-- count of excluded lists (and therefore of items/logs/members that will
-- also be absent below, cascading from this filter).
insert into lists_v2 (id, legacy_id, name, owner, updated_at, deleted_at)
select l.id, l.uid, l.name, l.admin, coalesce(l.created_at, now()), null
from lists l
where l.admin is not null;

-- lists.users is a jsonb array of {email, name, avatar, admin}. email is
-- stored lowercased: list_members.email is unique(list_id, email) on the
-- raw text, case-sensitive, and Task 19's share-token redemption upserts
-- on that same (list_id, email) pair using the authenticated user's email
-- verbatim. Two differently-cased legacy entries for the same person would
-- otherwise dodge on-conflict here AND collide with a future redemption
-- upsert as a spurious duplicate rather than an update.
insert into list_members (id, list_id, user_id, email, name, avatar, role)
select gen_random_uuid(), v.id, au.id, lower(u->>'email'), u->>'name', u->>'avatar',
       case when coalesce((u->>'admin')::boolean, false) then 'admin' else 'member' end
from lists l
join lists_v2 v on v.id = l.id
cross join lateral jsonb_array_elements(l.users) u
left join auth.users au on lower(au.email) = lower(u->>'email')
where u->>'email' is not null
on conflict (list_id, email) do nothing;

-- items.id stays int8 in production, so items keep the mint-a-uuid +
-- legacy_id treatment. items.list_id is already a uuid pointing straight at
-- lists.id, so no remap value is needed — but the join to lists_v2 (rather
-- than a raw select of i.list_id) is still required: items_v2.list_id is a
-- not-null FK to lists_v2, and an item on a list excluded above (null admin)
-- would violate that FK if copied verbatim. The inner join drops those items
-- instead of aborting the whole transaction; verify-v2.sql query 1a's items
-- delta is how that loss surfaces (query 0 explains the expected size of it,
-- and query 1b nets it back out to 0).
-- amount_type is the enum AmountType in production; cast to text explicitly.
-- times_updated and last_updated are deliberately not carried over as their
-- own columns — updated_at subsumes last_updated. best_before is real user
-- data with no TypeScript type or store method but must not be dropped.
insert into items_v2 (id, legacy_id, list_id, name, location, store,
                      amount, amount_to_purchase, amount_type, default_amount,
                      best_before, created_by, updated_at, deleted_at)
select gen_random_uuid(), i.id, v.id, i.name,
       coalesce(i.location, ''), coalesce(i.store, ''),
       coalesce(i.amount, 0), coalesce(i.amount_to_purchase, 0),
       coalesce(i.amount_type::text, 'count'), coalesce(i.default_amount, 1),
       i.best_before, i."user", coalesce(i.last_updated, i.created_at, now()), null
from items i
join lists_v2 v on v.id = i.list_id;

-- logs.id is already a uuid — reuse it directly, no gen_random_uuid, no
-- legacy_id column on logs_v2 to populate. Same FK reasoning as items above:
-- join to lists_v2 rather than copying list_id raw, so a log on an excluded
-- (admin-null) list is dropped instead of aborting the transaction.
insert into logs_v2 (id, list_id, actor_email, item_name, action, payload, created_at)
select g.id, v.id, g."user", g.item, g.action, g.payload, g.created_at
from logs g
join lists_v2 v on v.id = g.list_id;

-- recipes.id holds the USER's id, not a recipe id — the legacy row key is
-- `index`. r.id is already uuid, no cast needed. recipes.created_at seeds
-- updated_at, same as lists.created_at and items.created_at above — it was
-- missed in the first pass at this file and defaulted to a bare now(),
-- which would have silently replaced every migrated recipe's ordering with
-- the backfill's wall-clock time.
insert into recipes_v2 (id, legacy_index, user_id, name, description,
                        ingredients, instructions, saved, updated_at, deleted_at)
select gen_random_uuid(), r.index, r.id, r.name, r.description,
       coalesce(r.ingredients, '[]'::jsonb), r.instructions,
       coalesce(r.saved, false), coalesce(r.created_at, now()), null
from recipes r;

commit;

-- A member email with no auth.users row lands with user_id null. This claims
-- those rows if that person ever signs up. Kept in this file (rather than
-- verify-v2.sql) because it is schema DDL that must exist before the backfill
-- is considered complete — verify-v2.sql is read-only checks, this is not.
create or replace function public.claim_list_memberships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.list_members
     set user_id = new.id, updated_at = now()
   where user_id is null
     and lower(email) = lower(new.email);
  return new;
end;
$$;

create trigger claim_memberships_on_signup
after insert on auth.users
for each row execute function public.claim_list_memberships();
