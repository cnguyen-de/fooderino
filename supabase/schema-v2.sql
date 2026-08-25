-- supabase/schema-v2.sql
-- Local-first sync backend. Run once in the Supabase SQL editor.
-- Additive: the legacy tables are untouched until the cleanup task.

create extension if not exists pgcrypto;

create table public.lists_v2 (
  id         uuid primary key,
  legacy_id  bigint,
  name       text not null,
  owner      uuid not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.list_members (
  id         uuid primary key,
  list_id    uuid not null references public.lists_v2(id) on delete cascade,
  user_id    uuid,
  email      text not null,
  name       text,
  avatar     text,
  role       text not null default 'member' check (role in ('admin', 'member')),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (list_id, email)
);
create index list_members_user_idx on public.list_members(user_id) where deleted_at is null;

create table public.list_share_tokens (
  token      text primary key,
  list_id    uuid not null references public.lists_v2(id) on delete cascade,
  created_by uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table public.items_v2 (
  id                 uuid primary key,
  legacy_id          bigint,
  list_id            uuid not null references public.lists_v2(id) on delete cascade,
  name               text not null,
  location           text not null default '',
  store              text not null default '',
  amount             numeric not null default 0,
  amount_to_purchase numeric not null default 0,
  amount_type        text not null default 'count',
  default_amount     numeric not null default 1,
  created_by         text,
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index items_v2_list_idx on public.items_v2(list_id) where deleted_at is null;
create index items_v2_updated_idx on public.items_v2(updated_at);

create table public.item_ops (
  id         uuid primary key,
  item_id    uuid not null references public.items_v2(id) on delete cascade,
  list_id    uuid not null references public.lists_v2(id) on delete cascade,
  field      text not null check (field in ('amount', 'amount_to_purchase')),
  kind       text not null check (kind in ('delta', 'set')),
  value      numeric not null,
  actor      text,
  created_at timestamptz not null default now()
);
create index item_ops_created_idx on public.item_ops(created_at);

create table public.logs_v2 (
  id          uuid primary key,
  list_id     uuid not null references public.lists_v2(id) on delete cascade,
  actor_email text,
  item_name   text,
  action      text,
  payload     text,
  created_at  timestamptz not null default now()
);
create index logs_v2_list_created_idx on public.logs_v2(list_id, created_at desc);

create table public.recipes_v2 (
  id            uuid primary key,
  legacy_index  bigint,
  user_id       uuid not null,
  name          text not null,
  description   text,
  ingredients   jsonb not null default '[]'::jsonb,
  instructions  text,
  saved         boolean not null default false,
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table public.user_settings (
  id               uuid primary key,
  user_id          uuid not null unique,
  servings         integer not null default 1,
  allergies        text not null default '',
  cuisines         text not null default '',
  show_empty_items boolean not null default true,
  no_inventory     boolean not null default false,
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- Membership helper. Must be security definer: without it, the lists_v2
-- policy queries list_members, whose own policy queries lists_v2, and
-- Postgres recurses until it errors with "stack depth limit exceeded".
create or replace function public.is_list_member(target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.list_members
    where list_id = target
      and user_id = auth.uid()
      and deleted_at is null
  );
$$;

-- Owner check, needed to break the list_members bootstrap: RLS evaluates
-- WITH CHECK before the tuple exists, so a brand-new list has no member row
-- for is_list_member to find and its creator could never insert the first one.
-- security definer for the same reason as is_list_member — reading lists_v2
-- from inside a policy would otherwise re-enter that table's own policy.
create or replace function public.is_list_owner(target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.lists_v2
    where id = target and owner = auth.uid()
  );
$$;

-- The list-scoped access rule, in one place. Owner is included explicitly
-- because a list's owner must reach their own list even in the window before
-- the membership row has synced — the write-through push path sends one
-- collection at a time and cannot guarantee members land before items.
create or replace function public.can_access_list(target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_list_owner(target) or public.is_list_member(target);
$$;

-- `owner` is the root of list authority (is_list_owner reads it) and no
-- product feature transfers ownership. Pin it at insert time.
create or replace function public.guard_list_owner()
returns trigger
language plpgsql
as $$
begin
  if new.owner is distinct from old.owner then
    raise exception 'lists_v2.owner is immutable';
  end if;
  return new;
end;
$$;

create trigger lists_v2_guard_owner
before update on public.lists_v2
for each row execute function public.guard_list_owner();

-- item_ops is an append-only op log, not a value clients write directly:
-- two devices tapping +1 on the same item at once must both land, which
-- plain last-write-wins on items_v2.amount cannot guarantee. Clients insert
-- delta/set ops here and this trigger folds each one into the materialized
-- amount columns. It is the sole writer of items_v2.amount and
-- amount_to_purchase — must be `for each row`, not `for each statement`, or
-- a multi-row insert would fold only once and silently lose increments.
--
-- Deliberately NOT `security definer`. The UPDATE below runs under the
-- inserting user's RLS, which is what stops a client from pairing an op whose
-- `list_id` it can access with an `item_id` from a list it cannot: the update
-- matches zero rows instead of writing across the boundary. Making this a
-- definer would grant exactly that cross-list write.
--
-- The zero-row case is also silent by design. The realistic way to reach it is
-- a member removed from a shared list while offline with queued ops; raising
-- there would wedge that device's outbox permanently, since the drain stops at
-- the first throw. Discarding an op for a list the user no longer belongs to is
-- the correct outcome.
create or replace function public.apply_item_op()
returns trigger
language plpgsql
as $$
begin
  if new.kind = 'delta' then
    if new.field = 'amount' then
      update public.items_v2
         set amount = amount + new.value, updated_at = now()
       where id = new.item_id;
    else
      update public.items_v2
         set amount_to_purchase = amount_to_purchase + new.value, updated_at = now()
       where id = new.item_id;
    end if;
  else
    if new.field = 'amount' then
      update public.items_v2
         set amount = new.value, updated_at = now()
       where id = new.item_id;
    else
      update public.items_v2
         set amount_to_purchase = new.value, updated_at = now()
       where id = new.item_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger item_ops_apply
after insert on public.item_ops
for each row execute function public.apply_item_op();

-- Ops are already folded into items_v2 by the trigger above, so deleting old
-- rows here is garbage collection, not data loss — unlike the rest of this
-- schema, item_ops has no deleted_at and this is a real delete on purpose.
--
-- Runs as the function owner so it can actually delete: `item_ops` has RLS
-- enabled with no delete policy, so a caller relying on their own privileges
-- would silently remove zero rows and the table would grow without bound.
-- Execute is revoked from client roles — this is maintenance, invoked by the
-- scheduled job, never by the app. Safe as `security definer` (unlike
-- apply_item_op above) because it takes no arguments and its predicate is a
-- fixed time window — there is no caller-controlled input to subvert.
create or replace function public.compact_item_ops()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.item_ops where created_at < now() - interval '7 days';
$$;

revoke all on function public.compact_item_ops() from public, anon, authenticated;

alter table public.lists_v2          enable row level security;
alter table public.list_members      enable row level security;
alter table public.list_share_tokens enable row level security;
alter table public.items_v2          enable row level security;
alter table public.item_ops          enable row level security;
alter table public.logs_v2           enable row level security;
alter table public.recipes_v2        enable row level security;
alter table public.user_settings     enable row level security;

-- lists: members (and the owner, even before their member row has synced)
-- read/write; anyone signed in may create a list they own
create policy "member reads list"   on public.lists_v2 for select using (can_access_list(id));
create policy "member updates list" on public.lists_v2 for update using (can_access_list(id));
create policy "owner creates list"  on public.lists_v2 for insert with check (owner = auth.uid());

-- members: visible to fellow members (or the owner); you may insert your own
-- membership row; editing a membership row is narrower — see below, this is
-- deliberately not can_access_list
create policy "member reads members"  on public.list_members for select using (can_access_list(list_id));
create policy "member adds members"   on public.list_members for insert with check (can_access_list(list_id));
create policy "member writes members" on public.list_members
  for update
  using (is_list_owner(list_id) or user_id = auth.uid())
  with check (is_list_owner(list_id) or user_id = auth.uid());

-- share tokens: only members (or the owner) may mint or read them
create policy "member reads tokens"  on public.list_share_tokens for select using (can_access_list(list_id));
create policy "member mints tokens"  on public.list_share_tokens for insert with check (can_access_list(list_id));
create policy "member revokes tokens" on public.list_share_tokens for update using (can_access_list(list_id));

-- list-scoped data
create policy "member reads items"   on public.items_v2 for select using (can_access_list(list_id));
create policy "member writes items"  on public.items_v2 for update using (can_access_list(list_id));
create policy "member adds items"    on public.items_v2 for insert with check (can_access_list(list_id));

create policy "member reads ops"     on public.item_ops for select using (can_access_list(list_id));
create policy "member adds ops"      on public.item_ops for insert with check (can_access_list(list_id));

create policy "member reads logs"    on public.logs_v2 for select using (can_access_list(list_id));
create policy "member adds logs"     on public.logs_v2 for insert with check (can_access_list(list_id));

-- per-user data — select/insert/update only, no delete policy: these are
-- LWW tables with deleted_at, hard deletes are not part of this product
create policy "own recipes read"   on public.recipes_v2 for select using (user_id = auth.uid());
create policy "own recipes insert" on public.recipes_v2 for insert with check (user_id = auth.uid());
create policy "own recipes update" on public.recipes_v2 for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own settings read"   on public.user_settings for select using (user_id = auth.uid());
create policy "own settings insert" on public.user_settings for insert with check (user_id = auth.uid());
create policy "own settings update" on public.user_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Realtime
alter publication supabase_realtime add table public.lists_v2;
alter publication supabase_realtime add table public.list_members;
alter publication supabase_realtime add table public.items_v2;
alter publication supabase_realtime add table public.logs_v2;
alter publication supabase_realtime add table public.recipes_v2;
alter publication supabase_realtime add table public.user_settings;
