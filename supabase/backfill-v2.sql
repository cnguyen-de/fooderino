-- supabase/backfill-v2.sql
-- One-shot migration from the legacy tables. Re-runnable after truncating v2.
--
-- Legacy schema evidence (no live DB access — derived from application code;
-- types/database.types.ts is stale and was not used):
--   lists   -> app/store/list.ts (createList, renameList, removeUser), types/List.ts,
--              server/api/list.ts (confirms a `uid` column beyond types/List.ts)
--   items   -> app/store/item.ts (insertItem, updateItem, addItemToInventory), types/Item.ts
--   logs    -> app/store/logs.ts (insertLog)
--   recipes -> app/store/recipes.ts, types/Recipe.ts (recipes.id holds the user's id,
--              recipes.index is the legacy row key)
--   users   -> types/Settings.ts, server/api/settings.ts, app/store/settings.ts
--
-- To re-run: truncate lists_v2 cascade; truncate recipes_v2; truncate user_settings;
-- then re-run this whole file. The cascade on lists_v2 clears list_members, items_v2,
-- item_ops and logs_v2 via their FKs.

begin;

insert into lists_v2 (id, legacy_id, name, owner, updated_at, deleted_at)
select gen_random_uuid(), l.id, l.name, l.admin::uuid, now(), null
from lists l;

-- lists.users is a jsonb array of {email, name, avatar, admin}
insert into list_members (id, list_id, user_id, email, name, avatar, role)
select gen_random_uuid(), v.id, au.id, u->>'email', u->>'name', u->>'avatar',
       case when coalesce((u->>'admin')::boolean, false) then 'admin' else 'member' end
from lists l
join lists_v2 v on v.legacy_id = l.id
cross join lateral jsonb_array_elements(l.users) u
left join auth.users au on lower(au.email) = lower(u->>'email')
on conflict (list_id, email) do nothing;

-- items.user holds an email and maps to created_by. times_updated and
-- last_updated are deliberately not carried over — updated_at subsumes the latter.
insert into items_v2 (id, legacy_id, list_id, name, location, store,
                      amount, amount_to_purchase, amount_type, default_amount,
                      created_by, updated_at, deleted_at)
select gen_random_uuid(), i.id, v.id, i.name,
       coalesce(i.location, ''), coalesce(i.store, ''),
       coalesce(i.amount, 0), coalesce(i.amount_to_purchase, 0),
       coalesce(i.amount_type, 'count'), coalesce(i.default_amount, 1),
       i."user", coalesce(i.last_updated, now()), null
from items i
join lists_v2 v on v.legacy_id = i.list_id;

insert into logs_v2 (id, list_id, actor_email, item_name, action, payload, created_at)
select gen_random_uuid(), v.id, g."user", g.item, g.action, g.payload, g.created_at
from logs g
join lists_v2 v on v.legacy_id = g.list_id;

insert into recipes_v2 (id, legacy_index, user_id, name, description,
                        ingredients, instructions, saved, updated_at, deleted_at)
select gen_random_uuid(), r.index, r.id::uuid, r.name, r.description,
       coalesce(r.ingredients, '[]'::jsonb), r.instructions,
       coalesce(r.saved, false), now(), null
from recipes r;

-- Only the user-owned preferences move. ai and free_ai_calls stay on users.
insert into user_settings (id, user_id, servings, allergies, cuisines,
                           show_empty_items, no_inventory, updated_at)
select gen_random_uuid(), u.id, coalesce(u.servings, 1),
       coalesce(u.allergies, ''), coalesce(u.cuisines, ''),
       coalesce(u.show_empty_items, true), coalesce(u.no_inventory, false),
       now()
from users u
on conflict (user_id) do nothing;

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
