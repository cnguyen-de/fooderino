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

alter table public.lists_v2          enable row level security;
alter table public.list_members      enable row level security;
alter table public.list_share_tokens enable row level security;
alter table public.items_v2          enable row level security;
alter table public.item_ops          enable row level security;
alter table public.logs_v2           enable row level security;
alter table public.recipes_v2        enable row level security;
alter table public.user_settings     enable row level security;

-- lists: members read/write; anyone signed in may create a list they own
create policy "member reads list"   on public.lists_v2 for select using (is_list_member(id));
create policy "member updates list" on public.lists_v2 for update using (is_list_member(id));
create policy "owner creates list"  on public.lists_v2 for insert with check (owner = auth.uid());

-- members: visible to fellow members; you may insert your own membership row
create policy "member reads members"  on public.list_members for select using (is_list_member(list_id));
create policy "member writes members" on public.list_members for update using (is_list_member(list_id));
create policy "member adds members"   on public.list_members for insert with check (is_list_member(list_id));

-- share tokens: only members may mint or read them
create policy "member reads tokens"  on public.list_share_tokens for select using (is_list_member(list_id));
create policy "member mints tokens"  on public.list_share_tokens for insert with check (is_list_member(list_id));
create policy "member revokes tokens" on public.list_share_tokens for update using (is_list_member(list_id));

-- list-scoped data
create policy "member reads items"   on public.items_v2 for select using (is_list_member(list_id));
create policy "member writes items"  on public.items_v2 for update using (is_list_member(list_id));
create policy "member adds items"    on public.items_v2 for insert with check (is_list_member(list_id));

create policy "member reads ops"     on public.item_ops for select using (is_list_member(list_id));
create policy "member adds ops"      on public.item_ops for insert with check (is_list_member(list_id));

create policy "member reads logs"    on public.logs_v2 for select using (is_list_member(list_id));
create policy "member adds logs"     on public.logs_v2 for insert with check (is_list_member(list_id));

-- per-user data
create policy "own recipes" on public.recipes_v2   for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own settings" on public.user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Realtime
alter publication supabase_realtime add table public.lists_v2;
alter publication supabase_realtime add table public.list_members;
alter publication supabase_realtime add table public.items_v2;
alter publication supabase_realtime add table public.logs_v2;
alter publication supabase_realtime add table public.recipes_v2;
alter publication supabase_realtime add table public.user_settings;
