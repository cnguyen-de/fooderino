-- supabase/schema-v2.sql
-- Household backend for the local-first client. The operator applies it once
-- in the Supabase SQL editor, then cook.sql, then backfill-v2.sql. The contract is
-- docs/superpowers/specs/2026-11-16-household-redesign-design.md.
--
-- Write paths:
--   * apply_commands(jsonb) is the only writer of item state (amount, to_buy,
--     best_before, merged_into), bag entries, events and receipts.
--   * Item and household metadata stays last-write-wins through the client's
--     PostgREST upsert, guarded by stamp_lww and by column grants.
--   * move_household(...) is the only writer of memberships. Nitro calls it with
--     the service role.
-- Every row of a household-scoped table carries `seq`, taken from that
-- household's clock row under its row lock, so `seq > cursor` is an exact pull.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

create schema private;
revoke all on schema private from public;
alter default privileges in schema private revoke execute on functions from public;

-- Pure helpers ---------------------------------------------------------------

create function private.uuid_for(p_key text) returns uuid
language sql immutable set search_path = ''
as $$
  select extensions.uuid_generate_v5('3a2cb4a7-3838-46a3-9f66-38e685c696c0'::uuid, p_key)
$$;

-- tidy and norm_name mirror utils/pantry/ids.ts: tidy is the stored form,
-- norm_name the comparison key (diacritics, case and spacing folded).
create function private.tidy(p text) returns text
language sql immutable set search_path = ''
as $$
  select btrim(regexp_replace(p, '\s+', ' ', 'g'))
$$;

create function private.norm_name(p text) returns text
language sql immutable set search_path = ''
as $$
  select lower(private.tidy(regexp_replace(normalize(p, NFKD),
    '[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]', '', 'g')))
$$;

-- Every branch returns true or false. A CHECK that evaluates to NULL passes.
create function private.tags_valid(p jsonb) returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  v_tag jsonb;
begin
  if jsonb_typeof(p) is distinct from 'array' then return false; end if;
  for v_tag in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(v_tag) <> 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(v_tag)) <> 2 then return false; end if;
    if (v_tag ->> 'kind') is null or (v_tag ->> 'kind') not in ('place', 'store', 'other') then return false; end if;
    if jsonb_typeof(v_tag -> 'name') is distinct from 'string' then return false; end if;
    if btrim(v_tag ->> 'name') = '' then return false; end if;
  end loop;
  return true;
end;
$$;

create function private.aliases_valid(p text[]) returns boolean
language sql immutable set search_path = ''
as $$
  select p is not null and not exists (select 1 from unnest(p) a where a is null or btrim(a) = '')
$$;

-- Server-side metadata changes must beat any client sheet already stamped,
-- including one stamped in the same millisecond.
create function private.bump(p timestamptz) returns timestamptz
language sql stable set search_path = ''
as $$
  select greatest(p + interval '1 millisecond', now())
$$;

-- Drops blank aliases, duplicates, and any alias equal to the name.
create function private.normalize_aliases(p_name text, p_aliases text[]) returns text[]
language plpgsql immutable set search_path = ''
as $$
declare
  v_seen  text[] := array[private.norm_name(p_name)];
  v_out   text[] := '{}';
  v_alias text;
begin
  foreach v_alias in array p_aliases loop
    v_alias := private.tidy(v_alias);
    if coalesce(v_alias, '') = '' or private.norm_name(v_alias) = any(v_seen) then continue; end if;
    v_seen := v_seen || private.norm_name(v_alias);
    v_out := v_out || v_alias;
  end loop;
  return v_out;
end;
$$;

-- Drops blank tags and keeps the first of each (kind, normalized name).
create function private.normalize_tags(p_tags jsonb) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  v_seen text[] := '{}';
  v_out  jsonb := '[]';
  v_tag  jsonb;
  v_name text;
  v_key  text;
begin
  for v_tag in select t.value from jsonb_array_elements(p_tags) with ordinality t order by t.ordinality loop
    v_name := private.tidy(v_tag ->> 'name');
    v_key := (v_tag ->> 'kind') || ':' || private.norm_name(v_name);
    if coalesce(v_name, '') = '' or v_key = any(v_seen) then continue; end if;
    v_seen := v_seen || v_key;
    v_out := v_out || jsonb_build_array(jsonb_build_object('kind', v_tag -> 'kind', 'name', v_name));
  end loop;
  return v_out;
end;
$$;

create function private.item_names(p_name text, p_aliases text[]) returns text[]
language sql immutable set search_path = ''
as $$
  select array(select private.norm_name(n) from unnest(array[p_name] || p_aliases) n)
$$;

-- Tables -----------------------------------------------------------------------

create table public.households (
  id         uuid primary key,
  legacy_id  bigint unique,
  name       text not null check (btrim(name) <> ''),
  seq        bigint not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- No foreign key: a household's own insert takes its first seq from here
-- before the household row exists.
create table public.household_clocks (
  household_id uuid primary key,
  position     bigint not null
);

create table public.household_members (
  id           uuid primary key,
  household_id uuid not null references public.households(id),
  user_id      uuid,
  email        text not null check (email = lower(btrim(email)) and email <> ''),
  name         text,
  avatar       text,
  role         text not null default 'member' check (role in ('admin', 'member')),
  seq          bigint not null default 0,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (household_id, email)
);
create unique index household_members_one_live_user
  on public.household_members (user_id) where deleted_at is null;
create unique index household_members_one_live_email
  on public.household_members (lower(email)) where deleted_at is null;
create index household_members_pull on public.household_members (household_id, seq);

create table public.household_candidates (
  id           uuid primary key,
  household_id uuid not null references public.households(id),
  user_id      uuid,
  email        text not null check (email = lower(btrim(email)) and email <> ''),
  name         text,
  avatar       text,
  role         text not null check (role in ('admin', 'member')),
  consumed_at  timestamptz,
  unique (household_id, email)
);
create index household_candidates_open_user
  on public.household_candidates (user_id) where consumed_at is null;
create index household_candidates_open_email
  on public.household_candidates (email) where consumed_at is null;

-- token_hash is the hex sha256 of the token's UTF-8 bytes.
create table public.household_share_tokens (
  token_hash   text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  household_id uuid not null references public.households(id),
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);

create table public.items_v2 (
  id              uuid primary key,
  household_id    uuid not null references public.households(id),
  legacy_id       bigint unique,
  name            text not null check (btrim(name) <> ''),
  aliases         text[] not null default '{}' check (private.aliases_valid(aliases)),
  tags            jsonb not null default '[]' check (private.tags_valid(tags)),
  unit            text not null default 'count' check (unit in ('count', 'gram')),
  default_amount  numeric not null default 1 check (default_amount >= 0),
  shelf_life_days integer check (shelf_life_days >= 0),
  merged_into     uuid references public.items_v2(id) check (merged_into <> id),
  amount          numeric not null default 0 check (amount >= 0),
  to_buy          numeric not null default 0 check (to_buy >= 0),
  best_before     date,
  seq             bigint not null default 0,
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index items_pull on public.items_v2 (household_id, seq);

-- The receipt table. Every accepted command writes one row. `inverse` is what
-- an undo applies, and it is null for commands that cannot be undone.
create table public.command_log (
  command_id   uuid primary key,
  household_id uuid not null references public.households(id),
  kind         text not null check (kind in
                 ('create', 'use', 'want', 'tick', 'cancel_bag', 'unpack', 'set', 'undo', 'dismiss', 'merge')),
  actor        uuid not null,
  item_ids     uuid[] not null,
  at           timestamptz not null,
  inverse      jsonb,
  undone_by    uuid unique references public.command_log(command_id),
  seq          bigint not null default 0,
  created_at   timestamptz not null default now()
);
create index command_log_pull on public.command_log (household_id, seq);

create table public.item_events (
  id           uuid primary key,
  household_id uuid not null references public.households(id),
  item_id      uuid not null references public.items_v2(id),
  command_id   uuid references public.command_log(command_id),
  kind         text not null check (kind in ('purchase', 'consume', 'waste', 'correction', 'dismiss')),
  qty          numeric check (qty > 0),
  before       jsonb,
  after        jsonb,
  reverses     uuid unique references public.item_events(id),
  occurred_at  timestamptz not null,
  actor        uuid,
  origin       text not null check (origin in ('live', 'backfill', 'import')),
  seq          bigint not null default 0,
  -- One shape per kind, as types/pantry.ts ItemEvent. A consume or waste
  -- records the stock left as a number; a correction records Stock snapshots.
  constraint item_events_shape check (coalesce(
    case kind
      when 'purchase'   then qty is not null and before is null and after is null and reverses is null
      when 'consume'    then qty is not null and jsonb_typeof(after) = 'number' and before is null and reverses is null
      when 'waste'      then qty is not null and jsonb_typeof(after) = 'number' and before is null and reverses is null
      when 'correction' then qty is null and jsonb_typeof(before) = 'object' and jsonb_typeof(after) = 'object'
      when 'dismiss'    then qty is null and before is null and after is null and reverses is null
    end, false)),
  constraint item_events_live_has_command check (origin <> 'live' or command_id is not null)
);
create index item_events_pull on public.item_events (household_id, seq);
create index item_events_item on public.item_events (item_id, occurred_at);

create table public.bag_entries (
  id                uuid primary key,
  household_id      uuid not null references public.households(id),
  item_id           uuid not null references public.items_v2(id),
  qty               numeric not null check (qty > 0),
  from_list         numeric not null check (from_list >= 0),
  state             text not null default 'open' check (state in ('open', 'unpacked', 'cancelled')),
  bought_at         timestamptz not null,
  purchase_event    uuid not null unique references public.item_events(id),
  opened_by         uuid references public.command_log(command_id),
  closed_by_command uuid references public.command_log(command_id),
  seq               bigint not null default 0,
  check ((state = 'open') = (closed_by_command is null))
);
create index bag_entries_pull on public.bag_entries (household_id, seq);

-- household_id is null for a not_member rejection, which belongs to no
-- household the actor can write to.
create table public.rejected_commands (
  command_id   uuid primary key,
  household_id uuid references public.households(id),
  actor        uuid not null,
  kind         text,
  reason       text not null,
  seq          bigint,
  created_at   timestamptz not null default now()
);
create index rejected_commands_pull on public.rejected_commands (household_id, seq);

create table public.household_moves (
  request_id uuid primary key,
  user_id    uuid not null,
  action     text not null,
  result     jsonb not null,
  created_at timestamptz not null default now()
);

create table public.legacy_log_audit (
  log_id       uuid primary key,
  household_id uuid,
  item         text,
  action       text,
  payload      text,
  logged_at    timestamptz,
  reason       text not null check (reason in
                 ('no_household', 'action', 'unparseable', 'no_change', 'no_match', 'ambiguous'))
);

create table public.migration_runs (
  version text primary key,
  ran_at  timestamptz not null default now()
);

-- Clock and triggers ---------------------------------------------------------

-- The upsert takes the clock row lock and holds it to commit, so a second
-- writer to the same household waits here. That makes seq order commit order.
create function private.next_seq(p_household uuid) returns bigint
language sql set search_path = ''
as $$
  insert into public.household_clocks as c (household_id, position) values (p_household, 1)
  on conflict (household_id) do update set position = c.position + 1
  returning c.position
$$;

create function private.lock_household(p_household uuid) returns void
language sql set search_path = ''
as $$
  select 1 from public.household_clocks where household_id = p_household for update
$$;

-- tg_argv[0] names the column that holds the household id.
create function private.stamp_seq() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_household uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  if v_household is not null then
    new.seq := private.next_seq(v_household);
  end if;
  return new;
end;
$$;

create function private.stamp_lww() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.id <> old.id or (to_jsonb(new) ->> tg_argv[0]) <> (to_jsonb(old) ->> tg_argv[0]) then
    raise exception '% id and household are immutable', tg_table_name using errcode = '42501';
  end if;
  if new.updated_at < old.updated_at then
    return null;
  end if;
  new.seq := private.next_seq((to_jsonb(new) ->> tg_argv[0])::uuid);
  return new;
end;
$$;

-- A client's upsert locks the item row before its row trigger reaches the
-- clock, while apply_commands locks the clock before the item row. Taking the
-- caller's clock first, per statement, keeps one lock order and so no deadlock.
create function private.lock_caller_household() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null then
    perform private.lock_household(public.my_household());
  end if;
  return null;
end;
$$;

create trigger households_seq before insert on public.households
  for each row execute function private.stamp_seq('id');
create trigger households_lww before update on public.households
  for each row execute function private.stamp_lww('id');
create trigger households_lock before update on public.households
  for each statement execute function private.lock_caller_household();

create trigger items_seq before insert on public.items_v2
  for each row execute function private.stamp_seq('household_id');
create trigger items_lww before update on public.items_v2
  for each row execute function private.stamp_lww('household_id');
create trigger items_lock before insert or update on public.items_v2
  for each statement execute function private.lock_caller_household();

create trigger household_members_seq before insert or update on public.household_members
  for each row execute function private.stamp_seq('household_id');
create trigger command_log_seq before insert or update on public.command_log
  for each row execute function private.stamp_seq('household_id');
create trigger item_events_seq before insert or update on public.item_events
  for each row execute function private.stamp_seq('household_id');
create trigger bag_entries_seq before insert or update on public.bag_entries
  for each row execute function private.stamp_seq('household_id');
create trigger rejected_commands_seq before insert or update on public.rejected_commands
  for each row execute function private.stamp_seq('household_id');

-- Membership ------------------------------------------------------------------

create function public.my_household() returns uuid
language sql stable security definer set search_path = ''
as $$
  select household_id from public.household_members
   where user_id = auth.uid() and deleted_at is null
$$;

-- For the items_v2 insert policy. A subquery on items_v2 inside its own
-- policy is refused as infinite recursion, so the read runs as the owner.
create function private.item_exists(p_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.items_v2 where id = p_id)
$$;

create function private.household_of(p_user uuid) returns uuid
language sql stable set search_path = ''
as $$
  select household_id from public.household_members
   where user_id = p_user and deleted_at is null
$$;

-- Command boundary: parsing --------------------------------------------------

create function private.reject(p_reason text) returns void
language plpgsql set search_path = ''
as $$
begin
  raise exception using errcode = 'RJ001', message = p_reason;
end;
$$;

create function private.try_uuid(p text) returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return p::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- Each opt_* returns null for an absent or JSON-null value and rejects any
-- other wrong type, so 'NaN' or "3" never reach arithmetic.
create function private.opt_num(p jsonb) returns numeric
language plpgsql immutable set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) <> 'number' then perform private.reject('invalid'); end if;
  return (p #>> '{}')::numeric;
end;
$$;

create function private.opt_text(p jsonb) returns text
language plpgsql immutable set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) <> 'string' then perform private.reject('invalid'); end if;
  return p #>> '{}';
end;
$$;

-- YYYY-MM-DD only, like isLocalDate. A date that does not exist fails the cast.
create function private.opt_date(p jsonb) returns date
language plpgsql immutable set search_path = ''
as $$
declare
  v_text text := private.opt_text(p);
begin
  if v_text is not null and v_text !~ '^\d{4}-\d{2}-\d{2}$' then perform private.reject('invalid'); end if;
  return v_text::date;
end;
$$;

create function private.opt_bool(p jsonb) returns boolean
language plpgsql immutable set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) <> 'boolean' then perform private.reject('invalid'); end if;
  return (p #>> '{}')::boolean;
end;
$$;

create function private.opt_text_array(p jsonb) returns text[]
language plpgsql immutable set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) <> 'array'
     or exists (select 1 from jsonb_array_elements(p) e where jsonb_typeof(e) <> 'string') then
    perform private.reject('invalid');
  end if;
  return array(select e from jsonb_array_elements_text(p) e);
end;
$$;

-- Command effects ------------------------------------------------------------
-- The plpgsql twin of utils/pantry/reduce.ts. tests/fixtures/commands.json is
-- replayed against both, by supabase/tests/03_fixture.test.sql here.

-- The live item an id stands for, following merged_into, locked. A null row
-- when it is missing, deleted, merged away or in another household.
create function private.live_item(p_household uuid, p_id uuid) returns public.items_v2
language plpgsql set search_path = ''
as $$
declare
  v_item public.items_v2;
begin
  for hop in 1..64 loop
    select * into v_item from public.items_v2
     where id = p_id and household_id = p_household
       for update;
    exit when not found or v_item.merged_into is null;
    p_id := v_item.merged_into;
  end loop;
  if v_item.id is null or v_item.merged_into is not null or v_item.deleted_at is not null then
    return null;
  end if;
  return v_item;
end;
$$;

create function private.open_entry(p_household uuid, p_bag uuid) returns public.bag_entries
language plpgsql set search_path = ''
as $$
declare
  v_bag public.bag_entries;
begin
  select * into v_bag from public.bag_entries
   where id = p_bag and household_id = p_household
     for update;
  if not found then perform private.reject('not_found'); end if;
  if v_bag.state <> 'open' then perform private.reject('bag_closed'); end if;
  return v_bag;
end;
$$;

create function private.log_command(p_id uuid, p_household uuid, p_kind text, p_actor uuid,
                                    p_items uuid[], p_at timestamptz, p_inverse jsonb)
returns void
language sql set search_path = ''
as $$
  insert into public.command_log (command_id, household_id, kind, actor, item_ids, at, inverse)
  values (p_id, p_household, p_kind, p_actor, p_items, p_at, p_inverse)
$$;

create function private.stock(p public.items_v2) returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object('amount', p.amount, 'to_buy', p.to_buy, 'best_before', p.best_before)
$$;

create function private.add_event(p_id uuid, p_item public.items_v2, p_kind text, p_actor uuid,
                                  p_at timestamptz, p_qty numeric default null,
                                  p_before jsonb default null, p_after jsonb default null,
                                  p_reverses uuid default null)
returns void
language sql set search_path = ''
as $$
  insert into public.item_events (id, household_id, item_id, command_id, kind, qty, before, after,
                                  reverses, occurred_at, actor, origin)
  values (p_id, p_item.household_id, p_item.id, p_id, p_kind, p_qty, p_before, p_after,
          p_reverses, p_at, p_actor, 'live')
$$;

-- Cancels an open bag entry for cancel_bag and for undo of a tick: the listed
-- part goes back on the list, and a correction reverses the purchase.
create function private.cancel_bag(p_household uuid, p_bag uuid, p_id uuid, p_kind text,
                                   p_actor uuid, p_at timestamptz)
returns void
language plpgsql set search_path = ''
as $$
declare
  v_bag   public.bag_entries := private.open_entry(p_household, p_bag);
  v_item  public.items_v2 := private.live_item(p_household, v_bag.item_id);
  v_after public.items_v2;
begin
  if v_item.id is null then perform private.reject('not_found'); end if;
  perform private.log_command(p_id, p_household, p_kind, p_actor, array[v_item.id], p_at, null);
  update public.bag_entries set state = 'cancelled', closed_by_command = p_id where id = v_bag.id;
  update public.items_v2 set to_buy = to_buy + v_bag.from_list where id = v_item.id
  returning * into v_after;
  perform private.add_event(p_id, v_item, 'correction', p_actor, p_at,
                            p_before => private.stock(v_item), p_after => private.stock(v_after),
                            p_reverses => v_bag.purchase_event);
end;
$$;

-- `into` after taking in `src`: counts add, aliases and tags union with src's
-- name kept as an alias, and the soonest date of the sides that hold stock.
create function private.absorb_item(p_into uuid, p_src public.items_v2) returns void
language sql set search_path = ''
as $$
  update public.items_v2
     set amount      = amount + p_src.amount,
         to_buy      = to_buy + p_src.to_buy,
         best_before = case
                         when amount > 0 and p_src.amount = 0 then best_before
                         when amount = 0 and p_src.amount > 0 then p_src.best_before
                         else least(best_before, p_src.best_before)
                       end,
         aliases     = private.normalize_aliases(name, aliases || p_src.name || p_src.aliases),
         tags        = private.normalize_tags(tags || p_src.tags),
         updated_at  = private.bump(updated_at)
   where id = p_into
$$;

-- Applies one command for an actor who is a member of p_household and holds
-- its clock. Validation raises RJ001 with the reason before any write, in the
-- order reduce.ts checks. Every accepted command writes command_log, and its
-- event, if any, has the command's id. `inverse` holds the TS Inverse union.
create function private.apply_command(p_actor uuid, p_household uuid, p_id uuid, c jsonb)
returns void
language plpgsql set search_path = ''
as $$
declare
  v_kind   text := c ->> 'kind';
  v_at     timestamptz := (c ->> 'at')::timestamptz;
  v_item   public.items_v2;
  v_after  public.items_v2;
  v_into   public.items_v2;
  v_bag    public.bag_entries;
  v_target public.command_log;
  v_inv    jsonb;
  v_new    uuid;
  v_name   text;
  v_qty    numeric;
  v_from   numeric;
  v_amount numeric;
  v_days   numeric;
  v_date   date;
  v_place  text;
  v_tags   jsonb;
begin
  if v_at is null or v_kind is null or v_kind not in
     ('create', 'use', 'want', 'tick', 'cancel_bag', 'unpack', 'set', 'undo', 'dismiss', 'merge') then
    perform private.reject('invalid');
  end if;

  if v_kind = 'create' then
    v_new := private.try_uuid(c ->> 'item_id');
    v_name := private.tidy(private.opt_text(c #> '{item,name}'));
    v_days := private.opt_num(c #> '{item,shelf_life_days}');
    v_amount := private.opt_num(c #> '{item,default_amount}');
    if v_new is null or coalesce(v_name, '') = '' or v_amount is null or v_amount < 0
       or v_days < 0 or v_days <> trunc(v_days)
       or private.opt_text(c #> '{item,unit}') is distinct from 'count'
          and private.opt_text(c #> '{item,unit}') is distinct from 'gram'
       or exists (select 1 from public.items_v2 where id = v_new) then
      perform private.reject('invalid');
    end if;
    perform private.log_command(p_id, p_household, v_kind, p_actor, array[v_new], v_at, null);
    insert into public.items_v2 (id, household_id, name, aliases, tags, unit, default_amount,
                              shelf_life_days, amount, to_buy, best_before, updated_at)
    values (v_new, p_household, v_name,
            private.normalize_aliases(v_name, coalesce(private.opt_text_array(c #> '{item,aliases}'), '{}')),
            private.normalize_tags(coalesce(c #> '{item,tags}', '[]')),
            c #>> '{item,unit}', v_amount, v_days::integer,
            coalesce(private.opt_num(c #> '{start,amount}'), 0),
            coalesce(private.opt_num(c #> '{start,to_buy}'), 0),
            private.opt_date(c #> '{start,best_before}'),
            coalesce(private.opt_text(c #> '{item,updated_at}')::timestamptz, v_at));
    return;
  end if;

  if v_kind = 'cancel_bag' then
    perform private.cancel_bag(p_household, private.try_uuid(c ->> 'bag_id'), p_id, v_kind, p_actor, v_at);
    return;
  end if;

  if v_kind = 'unpack' then
    v_bag := private.open_entry(p_household, private.try_uuid(c ->> 'bag_id'));
    v_item := private.live_item(p_household, v_bag.item_id);
    if v_item.id is null then perform private.reject('not_found'); end if;
    v_date := private.opt_date(c -> 'best_before');
    v_place := private.tidy(private.opt_text(c -> 'place'));
    if (c ? 'best_before' and v_date is null) or (c ? 'place' and coalesce(v_place, '') = '') then
      perform private.reject('invalid');
    end if;
    -- An empty item's old date belonged to stock that is gone.
    v_after := v_item;
    v_after.best_before := case when v_item.amount = 0 then null else v_item.best_before end;
    v_after.best_before := least(v_after.best_before, v_date);
    v_tags := case when v_place is null then v_item.tags
                   else private.normalize_tags(v_item.tags || jsonb_build_array(
                          jsonb_build_object('kind', 'place', 'name', v_place))) end;
    perform private.log_command(p_id, p_household, v_kind, p_actor, array[v_item.id], v_at,
      jsonb_build_object('kind', 'repack', 'bag_id', v_bag.id, 'best_before', v_item.best_before));
    update public.bag_entries set state = 'unpacked', closed_by_command = p_id where id = v_bag.id;
    update public.items_v2
       set amount = amount + v_bag.qty,
           best_before = v_after.best_before,
           tags = v_tags,
           updated_at = case when v_tags = v_item.tags then updated_at else private.bump(updated_at) end
     where id = v_item.id;
    return;
  end if;

  if v_kind = 'undo' then
    select * into v_target from public.command_log
     where command_id = private.try_uuid(c ->> 'target') and household_id = p_household
       for update;
    if not found or v_target.undone_by is not null or v_target.inverse is null then
      perform private.reject('cannot_undo');
    end if;
    v_inv := v_target.inverse;

    if v_inv ->> 'kind' = 'cancel_bag' then
      perform private.cancel_bag(p_household, (v_inv ->> 'bag_id')::uuid, p_id, v_kind, p_actor, v_at);

    elsif v_inv ->> 'kind' = 'repack' then
      select * into v_bag from public.bag_entries
       where id = (v_inv ->> 'bag_id')::uuid and household_id = p_household
         for update;
      v_item := private.live_item(p_household, v_bag.item_id);
      if v_bag.id is null or v_item.id is null or v_item.amount < v_bag.qty then
        perform private.reject('cannot_undo');
      end if;
      perform private.log_command(p_id, p_household, v_kind, p_actor, array[v_item.id], v_at, null);
      update public.bag_entries set state = 'open', closed_by_command = null where id = v_bag.id;
      update public.items_v2
         set amount = amount - v_bag.qty, best_before = (v_inv ->> 'best_before')::date
       where id = v_item.id;

    else
      v_item := private.live_item(p_household, (v_inv ->> 'item_id')::uuid);
      if v_item.id is null then perform private.reject('cannot_undo'); end if;
      perform private.log_command(p_id, p_household, v_kind, p_actor, array[v_item.id], v_at, null);
      case v_inv ->> 'kind'
      when 'restock' then
        update public.items_v2 set amount = amount + (v_inv ->> 'qty')::numeric where id = v_item.id
        returning * into v_after;
      when 'restore_to_buy' then
        update public.items_v2 set to_buy = (v_inv ->> 'to_buy')::numeric where id = v_item.id;
      when 'restore_stock' then
        update public.items_v2
           set amount = case when v_inv -> 'before' ? 'amount'
                             then (v_inv #>> '{before,amount}')::numeric else amount end,
               best_before = case when v_inv -> 'before' ? 'best_before'
                                  then (v_inv #>> '{before,best_before}')::date else best_before end
         where id = v_item.id
        returning * into v_after;
      end case;
      if v_inv ? 'reverses' then
        perform private.add_event(p_id, v_item, 'correction', p_actor, v_at,
                                  p_before => private.stock(v_item), p_after => private.stock(v_after),
                                  p_reverses => (v_inv ->> 'reverses')::uuid);
      end if;
    end if;

    update public.command_log set undone_by = p_id where command_id = v_target.command_id;
    return;
  end if;

  v_item := private.live_item(p_household, private.try_uuid(c ->> 'item_id'));
  if v_item.id is null then perform private.reject('not_found'); end if;

  case v_kind
  when 'use' then
    v_qty := private.opt_num(c -> 'qty');
    if v_qty is null or v_qty <= 0 then perform private.reject('invalid'); end if;
    if v_item.amount < v_qty then perform private.reject('insufficient_stock'); end if;
    perform private.log_command(p_id, p_household, v_kind, p_actor, array[v_item.id], v_at,
      jsonb_build_object('kind', 'restock', 'item_id', v_item.id, 'qty', v_qty, 'reverses', p_id));
    update public.items_v2 set amount = amount - v_qty where id = v_item.id;
    perform private.add_event(p_id, v_item,
                              case when private.opt_bool(c -> 'waste') then 'waste' else 'consume' end,
                              p_actor, v_at, p_qty => v_qty, p_after => to_jsonb(v_item.amount - v_qty));

  when 'want' then
    v_qty := private.opt_num(c -> 'qty');
    if v_qty is null or v_qty < 0 then perform private.reject('invalid'); end if;
    perform private.log_command(p_id, p_household, v_kind, p_actor, array[v_item.id], v_at,
      jsonb_build_object('kind', 'restore_to_buy', 'item_id', v_item.id, 'to_buy', v_item.to_buy));
    update public.items_v2 set to_buy = v_qty where id = v_item.id;

  when 'tick' then
    v_bag.id := private.try_uuid(c ->> 'bag_id');
    v_qty := private.opt_num(c -> 'qty');
    v_from := private.opt_num(c -> 'from_list');
    if v_qty is null or v_qty <= 0 or v_from is null or v_from < 0 or v_from > v_qty
       or v_bag.id is null or exists (select 1 from public.bag_entries where id = v_bag.id) then
      perform private.reject('invalid');
    end if;
    -- Another shopper may have ticked the same line first: take only what is still listed.
    v_from := least(v_from, v_item.to_buy);
    perform private.log_command(p_id, p_household, v_kind, p_actor, array[v_item.id], v_at,
      jsonb_build_object('kind', 'cancel_bag', 'bag_id', v_bag.id));
    update public.items_v2 set to_buy = to_buy - v_from where id = v_item.id;
    perform private.add_event(p_id, v_item, 'purchase', p_actor, v_at, p_qty => v_qty);
    insert into public.bag_entries (id, household_id, item_id, qty, from_list, state, bought_at,
                                    purchase_event, opened_by)
    values (v_bag.id, p_household, v_item.id, v_qty, v_from, 'open', v_at, p_id, p_id);

  when 'set' then
    if c ? 'amount' then
      v_amount := private.opt_num(c -> 'amount');
      if v_amount is null or v_amount < 0 then perform private.reject('invalid'); end if;
    end if;
    v_date := private.opt_date(c -> 'best_before');
    if not (c ? 'amount' or c ? 'best_before') then perform private.reject('invalid'); end if;
    v_inv := '{}';
    if c ? 'amount' then v_inv := v_inv || jsonb_build_object('amount', v_item.amount); end if;
    if c ? 'best_before' then v_inv := v_inv || jsonb_build_object('best_before', v_item.best_before); end if;
    perform private.log_command(p_id, p_household, v_kind, p_actor, array[v_item.id], v_at,
      jsonb_build_object('kind', 'restore_stock', 'item_id', v_item.id, 'before', v_inv, 'reverses', p_id));
    update public.items_v2
       set amount = case when c ? 'amount' then v_amount else amount end,
           best_before = case when c ? 'best_before' then v_date else best_before end
     where id = v_item.id
    returning * into v_after;
    perform private.add_event(p_id, v_item, 'correction', p_actor, v_at,
                              p_before => private.stock(v_item), p_after => private.stock(v_after));

  when 'dismiss' then
    perform private.log_command(p_id, p_household, v_kind, p_actor, array[v_item.id], v_at, null);
    perform private.add_event(p_id, v_item, 'dismiss', p_actor, v_at);

  when 'merge' then
    v_into := private.live_item(p_household, private.try_uuid(c ->> 'into'));
    if v_into.id is null then perform private.reject('not_found'); end if;
    if v_into.id = v_item.id or v_into.unit <> v_item.unit then perform private.reject('invalid'); end if;
    perform private.log_command(p_id, p_household, v_kind, p_actor, array[v_item.id, v_into.id], v_at, null);
    perform private.absorb_item(v_into.id, v_item);
    update public.items_v2 set merged_into = v_into.id, amount = 0, to_buy = 0 where id = v_item.id;
  end case;
end;
$$;

create function private.receipt(p_id uuid) returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('id', command_id, 'status', 'accepted')
       from public.command_log where command_id = p_id),
    (select jsonb_build_object('id', command_id, 'status', 'rejected', 'reason', reason)
       from public.rejected_commands where command_id = p_id))
$$;

create function private.apply_one(p_actor uuid, p_id uuid, c jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_household uuid := private.household_of(p_actor);
  v_reason    text;
begin
  if private.receipt(p_id) is not null then return private.receipt(p_id); end if;

  if v_household is not null and v_household = private.try_uuid(c ->> 'household_id') then
    perform private.lock_household(v_household);
    -- Re-read under the lock: a duplicate of this command or a membership
    -- move may have committed while this transaction waited.
    if private.receipt(p_id) is not null then return private.receipt(p_id); end if;
    v_household := private.household_of(p_actor);
  end if;

  if v_household is null or v_household is distinct from private.try_uuid(c ->> 'household_id') then
    insert into public.rejected_commands (command_id, household_id, actor, kind, reason)
    values (p_id, null, p_actor, c ->> 'kind', 'not_member')
    on conflict (command_id) do nothing;
    return private.receipt(p_id);
  end if;

  begin
    perform private.apply_command(p_actor, v_household, p_id, c);
    return jsonb_build_object('id', p_id, 'status', 'accepted');
  exception
    when sqlstate 'RJ001' then v_reason := sqlerrm;
    when data_exception or integrity_constraint_violation then v_reason := 'invalid';
  end;
  insert into public.rejected_commands (command_id, household_id, actor, kind, reason)
  values (p_id, v_household, p_actor, c ->> 'kind', v_reason);
  return jsonb_build_object('id', p_id, 'status', 'rejected', 'reason', v_reason);
end;
$$;

create function private.touched_rows(p_household uuid, p_ids uuid[]) returns jsonb
language sql stable set search_path = ''
as $$
  with touched as (
    select distinct unnest(l.item_ids) as id
      from public.command_log l
     where l.command_id = any(p_ids) and l.household_id = p_household
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.seq) from public.items_v2 i
       where i.household_id = p_household and i.id in (select id from touched)), '[]'),
    'bag', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.seq) from public.bag_entries b
       where b.household_id = p_household
         and (b.opened_by = any(p_ids) or b.closed_by_command = any(p_ids)
              or (b.state = 'open' and b.item_id in (select id from touched)))), '[]'),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.seq) from public.item_events e
       where e.household_id = p_household and e.command_id = any(p_ids)), '[]'),
    'commands', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.seq) from public.command_log l
       where l.household_id = p_household
         and (l.command_id = any(p_ids) or l.undone_by = any(p_ids))), '[]'))
$$;

-- The client's only write path for item state. Applies up to 50 commands in
-- order. Each is idempotent by id: a retry returns the stored receipt and
-- changes nothing. Returns {results: [{id, status, reason?}], items, bag,
-- events, commands}, where the row lists hold the current state of every row
-- the batch touched, each with its seq.
create function public.apply_commands(commands jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor   uuid := auth.uid();
  v_cmd     jsonb;
  v_id      uuid;
  v_ids     uuid[] := '{}';
  v_results jsonb := '[]';
begin
  if v_actor is null then
    raise exception 'apply_commands needs a signed-in user' using errcode = '28000';
  end if;
  if jsonb_typeof(commands) is distinct from 'array' or jsonb_array_length(commands) > 50 then
    raise exception 'commands must be an array of at most 50' using errcode = '22023';
  end if;

  for v_cmd in select value from jsonb_array_elements(commands) with ordinality order by ordinality loop
    v_id := private.try_uuid(v_cmd ->> 'id');
    if v_id is null then
      v_results := v_results || jsonb_build_array(
        jsonb_build_object('id', v_cmd -> 'id', 'status', 'rejected', 'reason', 'malformed'));
      continue;
    end if;
    v_ids := v_ids || v_id;
    v_results := v_results || jsonb_build_array(private.apply_one(v_actor, v_id, v_cmd));
  end loop;

  return jsonb_build_object('results', v_results)
      || private.touched_rows(private.household_of(v_actor), v_ids);
end;
$$;

-- Households: create, join, pick, leave --------------------------------------

create function private.enter_household(p_household uuid, p_user uuid, p_email text,
                                        p_meta jsonb, p_role text)
returns void
language sql set search_path = ''
as $$
  insert into public.household_members as m (id, household_id, user_id, email, name, avatar, role)
  values (private.uuid_for('member:' || p_household || ':' || p_email), p_household, p_user, p_email,
          coalesce(p_meta ->> 'full_name', p_meta ->> 'name'),
          coalesce(p_meta ->> 'picture', p_meta ->> 'avatar_url'), p_role)
  on conflict (household_id, email) do update
     set user_id = excluded.user_id,
         deleted_at = null,
         updated_at = now(),
         name = coalesce(excluded.name, m.name),
         avatar = coalesce(excluded.avatar, m.avatar),
         role = case when m.role = 'admin' then 'admin' else excluded.role end
$$;

-- A household with no live member and no open candidate is archived.
create function private.archive_if_empty(p_household uuid) returns void
language sql set search_path = ''
as $$
  update public.households
     set deleted_at = now(), updated_at = private.bump(updated_at)
   where id = p_household
     and deleted_at is null
     and not exists (select 1 from public.household_members
                      where household_id = p_household and deleted_at is null)
     and not exists (select 1 from public.household_candidates
                      where household_id = p_household and consumed_at is null)
$$;

create function private.consume_candidates(p_user uuid, p_email text) returns void
language plpgsql set search_path = ''
as $$
declare
  v_household uuid;
begin
  for v_household in
    update public.household_candidates
       set consumed_at = now(), user_id = coalesce(user_id, p_user)
     where (user_id = p_user or (user_id is null and email = p_email)) and consumed_at is null
    returning household_id
  loop
    perform private.archive_if_empty(v_household);
  end loop;
end;
$$;

-- Follows merged_into to the end of the chain, without checks or locks.
create function private.resolve_id(p_id uuid) returns uuid
language plpgsql stable set search_path = ''
as $$
declare
  v_next uuid;
begin
  for hop in 1..64 loop
    select merged_into into v_next from public.items_v2 where id = p_id;
    exit when v_next is null;
    p_id := v_next;
  end loop;
  return p_id;
end;
$$;

-- plan_merge, the SQL side of utils/pantry/merge.ts planHouseholdMerge. Every
-- live item of p_source is brought into p_target. Matching is planned against
-- the target as it was before the move: a source item whose normalized names
-- meet exactly one live target item of the same unit merges into it (absorb),
-- and every other item, ambiguous ones included, is copied. Open bag entries
-- the mover ticked follow their item. The source household is unchanged.
create function private.bring_items(p_source uuid, p_target uuid, p_salt text, p_mover uuid)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_plan   jsonb;
  v_step   jsonb;
  v_src    public.items_v2;
  v_match  uuid;
  v_map    jsonb := '{}';
  v_bag    public.bag_entries;
  v_event  uuid;
  v_merged integer := 0;
  v_copied integer := 0;
  v_bags   integer := 0;
begin
  select coalesce(jsonb_agg(jsonb_build_object('src', s.id, 'matches', (
           select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'unit', t.unit)), '[]')
             from public.items_v2 t
            where t.household_id = p_target and t.deleted_at is null and t.merged_into is null
              and private.item_names(t.name, t.aliases) && private.item_names(s.name, s.aliases)))
         order by s.id), '[]')
    into v_plan
    from public.items_v2 s
   where s.household_id = p_source and s.deleted_at is null and s.merged_into is null;

  for v_step in select value from jsonb_array_elements(v_plan) loop
    select * into v_src from public.items_v2 where id = (v_step ->> 'src')::uuid;
    if jsonb_array_length(v_step -> 'matches') = 1 and v_step #>> '{matches,0,unit}' = v_src.unit then
      v_match := (v_step #>> '{matches,0,id}')::uuid;
      perform private.absorb_item(v_match, v_src);
      v_merged := v_merged + 1;
    else
      v_match := private.uuid_for('move:' || p_salt || ':' || v_src.id);
      insert into public.items_v2 (id, household_id, name, aliases, tags, unit, default_amount,
                                shelf_life_days, amount, to_buy, best_before, updated_at)
      values (v_match, p_target, v_src.name, v_src.aliases, v_src.tags, v_src.unit,
              v_src.default_amount, v_src.shelf_life_days, v_src.amount, v_src.to_buy,
              v_src.best_before, v_src.updated_at);
      v_copied := v_copied + 1;
    end if;
    v_map := v_map || jsonb_build_object(v_src.id::text, v_match);
  end loop;

  for v_bag in
    select b.* from public.bag_entries b
      join public.command_log l on l.command_id = b.opened_by
     where b.household_id = p_source and b.state = 'open' and l.actor = p_mover
       and v_map ? private.resolve_id(b.item_id)::text
     order by b.id
  loop
    v_match := (v_map ->> private.resolve_id(v_bag.item_id)::text)::uuid;
    v_event := private.uuid_for('move-event:' || p_salt || ':' || v_bag.purchase_event);
    insert into public.item_events (id, household_id, item_id, kind, qty, occurred_at, actor, origin)
    values (v_event, p_target, v_match, 'purchase', v_bag.qty, v_bag.bought_at, p_mover, 'import');
    insert into public.bag_entries (id, household_id, item_id, qty, from_list, state, bought_at,
                                    purchase_event)
    values (private.uuid_for('move-bag:' || p_salt || ':' || v_bag.id), p_target, v_match,
            v_bag.qty, v_bag.from_list, 'open', v_bag.bought_at, v_event);
    v_bags := v_bags + 1;
  end loop;

  return jsonb_build_object('merged', v_merged, 'copied', v_copied, 'bag', v_bags);
end;
$$;

create function private.move(p_request uuid, p_user uuid, p_email text, p_meta jsonb,
                             p_action text, p_args jsonb)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_old       uuid := private.household_of(p_user);
  v_target    uuid;
  v_token     public.household_share_tokens;
  v_role      text;
  v_import    uuid[];
  v_source    uuid;
  v_brought   jsonb := '{"merged": 0, "copied": 0, "bag": 0}';
  v_summary   jsonb;
begin
  case p_action
  when 'create' then
    if v_old is not null then return jsonb_build_object('status', 'error', 'reason', 'already_member'); end if;
    if coalesce(btrim(p_args ->> 'name'), '') = '' then
      return jsonb_build_object('status', 'error', 'reason', 'invalid_name');
    end if;
    v_target := private.uuid_for('household:' || p_request);
    insert into public.households (id, name) values (v_target, btrim(p_args ->> 'name'));
    perform private.enter_household(v_target, p_user, p_email, p_meta, 'admin');

  when 'join' then
    select * into v_token from public.household_share_tokens
     where token_hash = encode(sha256(convert_to(coalesce(p_args ->> 'token', ''), 'UTF8')), 'hex');
    if not found then return jsonb_build_object('status', 'error', 'reason', 'missing'); end if;
    if v_token.revoked_at is not null then return jsonb_build_object('status', 'error', 'reason', 'revoked'); end if;
    if v_token.expires_at <= now() then return jsonb_build_object('status', 'error', 'reason', 'expired'); end if;
    v_target := v_token.household_id;
    if exists (select 1 from public.households where id = v_target and deleted_at is not null) then
      return jsonb_build_object('status', 'error', 'reason', 'household_gone');
    end if;
    if v_old = v_target then
      return jsonb_build_object('status', 'ok', 'household_id', v_target) || v_brought;
    end if;
    perform 1 from public.household_clocks
     where household_id in (v_old, v_target) order by household_id for update;
    if v_old is not null then
      if coalesce((p_args ->> 'bring')::boolean, true) then
        v_brought := private.bring_items(v_old, v_target, p_request::text, p_user);
      end if;
      update public.household_members set deleted_at = now(), updated_at = now()
       where household_id = v_old and user_id = p_user and deleted_at is null;
      perform private.archive_if_empty(v_old);
    end if;
    select role into v_role from public.household_members where household_id = v_target and email = p_email;
    perform private.enter_household(v_target, p_user, p_email, p_meta, coalesce(v_role, 'member'));

  when 'pick' then
    if v_old is not null then return jsonb_build_object('status', 'error', 'reason', 'already_member'); end if;
    v_target := private.try_uuid(p_args ->> 'household');
    select role into v_role from public.household_candidates
     where household_id = v_target and consumed_at is null
       and (user_id = p_user or (user_id is null and email = p_email));
    v_import := array(select distinct private.try_uuid(x)
                        from jsonb_array_elements_text(coalesce(p_args -> 'import', '[]')) x);
    if v_role is null or v_target = any(v_import) or exists (
      select 1 from unnest(v_import) i
       where i is null or not exists (
         select 1 from public.household_candidates hc
          where hc.household_id = i and hc.consumed_at is null
            and (hc.user_id = p_user or (hc.user_id is null and hc.email = p_email)))
    ) then
      return jsonb_build_object('status', 'error', 'reason', 'not_candidate');
    end if;
    if exists (select 1 from public.households where id = v_target and deleted_at is not null) then
      return jsonb_build_object('status', 'error', 'reason', 'household_gone');
    end if;
    perform 1 from public.household_clocks
     where household_id = any(v_import || v_target) order by household_id for update;
    perform private.enter_household(v_target, p_user, p_email, p_meta, v_role);
    foreach v_source in array array(select unnest(v_import) order by 1) loop
      v_summary := private.bring_items(v_source, v_target, p_request::text, p_user);
      v_brought := jsonb_build_object(
        'merged', (v_brought ->> 'merged')::int + (v_summary ->> 'merged')::int,
        'copied', (v_brought ->> 'copied')::int + (v_summary ->> 'copied')::int,
        'bag',    (v_brought ->> 'bag')::int + (v_summary ->> 'bag')::int);
    end loop;

  when 'leave' then
    if v_old is null then return jsonb_build_object('status', 'error', 'reason', 'not_member'); end if;
    perform private.lock_household(v_old);
    update public.household_members set deleted_at = now(), updated_at = now()
     where household_id = v_old and user_id = p_user and deleted_at is null;
    perform private.archive_if_empty(v_old);
    return jsonb_build_object('status', 'ok', 'household_id', null, 'left', v_old);
  end case;

  perform private.consume_candidates(p_user, p_email);
  return jsonb_build_object('status', 'ok', 'household_id', v_target) || v_brought;
end;
$$;

-- The only writer of memberships. Nitro calls it with the service role and the
-- user id from the verified JWT. One transaction: it locks the user, replays a
-- recorded request, or applies the move and records its result, so a retried
-- request_id returns the first result. Actions and p_args:
--   create {name}            join {token, bring}
--   pick {household, import} leave {}
-- Returns {status: 'ok', household_id, merged, copied, bag} or {status: 'error', reason}.
create function public.move_household(p_request_id uuid, p_user_id uuid, p_action text,
                                      p_args jsonb default '{}')
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_prior  public.household_moves;
  v_email  text;
  v_meta   jsonb;
  v_result jsonb;
begin
  if p_request_id is null or p_user_id is null
     or p_action is null or p_action not in ('create', 'join', 'pick', 'leave') then
    raise exception 'move_household needs a request id, a user id and a known action' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('household_move:' || p_user_id, 0));

  select * into v_prior from public.household_moves where request_id = p_request_id;
  if found then
    if v_prior.user_id <> p_user_id then
      raise exception 'request % belongs to another user', p_request_id using errcode = '22023';
    end if;
    return v_prior.result;
  end if;

  select lower(btrim(u.email)), u.raw_user_meta_data into v_email, v_meta
    from auth.users u where u.id = p_user_id;
  if v_email is null or v_email = '' then
    raise exception 'user % has no email', p_user_id using errcode = '22023';
  end if;

  v_result := private.move(p_request_id, p_user_id, v_email, coalesce(v_meta, '{}'), p_action,
                           coalesce(p_args, '{}'));
  insert into public.household_moves (request_id, user_id, action, result)
  values (p_request_id, p_user_id, p_action, v_result);
  return v_result;
end;
$$;

-- Grants -------------------------------------------------------------------

revoke all on all functions in schema private from public;
-- items_v2's CHECK constraints and insert policy call these as the writing
-- role, so a client's metadata push needs EXECUTE on them.
grant execute on function private.tags_valid(jsonb), private.aliases_valid(text[]),
                          private.item_exists(uuid) to authenticated;
revoke all on function public.my_household() from public, anon, authenticated, service_role;
revoke all on function public.apply_commands(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.move_household(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.my_household() to authenticated;
grant execute on function public.apply_commands(jsonb) to authenticated;
grant execute on function public.move_household(uuid, uuid, text, jsonb) to service_role;

revoke all on public.households, public.household_clocks, public.household_members,
              public.household_candidates, public.household_share_tokens, public.items_v2,
              public.command_log, public.item_events, public.bag_entries, public.rejected_commands,
              public.household_moves, public.legacy_log_audit, public.migration_runs
  from anon, authenticated;

grant select on public.households, public.household_members, public.household_candidates,
                public.household_share_tokens, public.items_v2, public.command_log, public.item_events,
                public.bag_entries, public.rejected_commands
  to authenticated;

-- Metadata only. amount, to_buy, best_before, merged_into, legacy_id and seq
-- are server-owned. INSERT is granted because a PostgREST upsert is an INSERT;
-- the insert policies below only admit rows that already exist.
grant insert (id, name, updated_at), update (id, name, updated_at)
  on public.households to authenticated;
grant insert (id, household_id, name, aliases, tags, unit, default_amount, shelf_life_days, updated_at, deleted_at),
      update (id, household_id, name, aliases, tags, unit, default_amount, shelf_life_days, updated_at, deleted_at)
  on public.items_v2 to authenticated;
grant insert (token_hash, household_id, created_by, expires_at), update (revoked_at)
  on public.household_share_tokens to authenticated;

-- RLS ------------------------------------------------------------------------

alter table public.households             enable row level security;
alter table public.household_clocks       enable row level security;
alter table public.household_members      enable row level security;
alter table public.household_candidates   enable row level security;
alter table public.household_share_tokens enable row level security;
alter table public.items_v2                  enable row level security;
alter table public.command_log            enable row level security;
alter table public.item_events            enable row level security;
alter table public.bag_entries            enable row level security;
alter table public.rejected_commands      enable row level security;
alter table public.household_moves        enable row level security;
alter table public.legacy_log_audit       enable row level security;
alter table public.migration_runs         enable row level security;

create policy "members read their household" on public.households
  for select to authenticated using (id = (select public.my_household()));
create policy "members upsert their household" on public.households
  for insert to authenticated with check (id = (select public.my_household()));
create policy "members rename their household" on public.households
  for update to authenticated
  using (id = (select public.my_household())) with check (id = (select public.my_household()));

create policy "members read members, users read their own rows" on public.household_members
  for select to authenticated
  using (household_id = (select public.my_household()) or user_id = (select auth.uid()));

create policy "users read their own candidates" on public.household_candidates
  for select to authenticated using (user_id = (select auth.uid()));

create policy "members read tokens" on public.household_share_tokens
  for select to authenticated using (household_id = (select public.my_household()));
create policy "members mint tokens" on public.household_share_tokens
  for insert to authenticated
  with check (household_id = (select public.my_household()) and created_by = (select auth.uid()));
create policy "members revoke tokens" on public.household_share_tokens
  for update to authenticated
  using (household_id = (select public.my_household()))
  with check (household_id = (select public.my_household()));

create policy "members read items" on public.items_v2
  for select to authenticated using (household_id = (select public.my_household()));
-- Creation goes through the create command, so an upsert may only land on a
-- row that already exists.
create policy "members upsert existing items" on public.items_v2
  for insert to authenticated
  with check (household_id = (select public.my_household()) and private.item_exists(id));
create policy "members edit item metadata" on public.items_v2
  for update to authenticated
  using (household_id = (select public.my_household()))
  with check (household_id = (select public.my_household()));

create policy "members read command log" on public.command_log
  for select to authenticated using (household_id = (select public.my_household()));
create policy "members read events" on public.item_events
  for select to authenticated using (household_id = (select public.my_household()));
create policy "members read the bag" on public.bag_entries
  for select to authenticated using (household_id = (select public.my_household()));
create policy "members and actors read rejections" on public.rejected_commands
  for select to authenticated
  using (household_id = (select public.my_household()) or actor = (select auth.uid()));

-- Realtime only nudges a pull. RLS decides who hears which row.
alter publication supabase_realtime add table
  public.households, public.household_members, public.items_v2, public.bag_entries,
  public.item_events, public.command_log, public.rejected_commands;
