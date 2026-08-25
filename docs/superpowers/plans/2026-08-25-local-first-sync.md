# Local-First Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Fooderino from CRUD-over-Supabase to a local-first app where IndexedDB is the source of truth and Supabase syncs in the background, with QR-code list sharing and no data loss for existing accounts.

**Architecture:** Dexie holds every record; Vue reads it through `liveQuery` and writes to it synchronously, so the UI never waits on the network. A generic sync engine pushes dirty rows and a durable op queue to typed Supabase v2 tables, pulls incrementally on an `updated_at` cursor, and subscribes to Realtime. Conflicts resolve last-write-wins, except `amount` and `amount_to_purchase`, which sync as `delta`/`set` operations folded by a Postgres trigger so concurrent increments add up.

**Tech Stack:** Nuxt 4 (`ssr: false`), Vue 3, Pinia, Dexie 4, `@nuxtjs/supabase`, Supabase Postgres + Realtime, Vitest + fake-indexeddb, `qrcode` + `jsqr`, TailwindCSS, shadcn-vue.

**Spec:** `docs/superpowers/specs/2026-08-25-local-first-sync-design.md`

## Global Constraints

- **Field naming is snake_case everywhere** — Dexie records use the exact column names of their Supabase table (`amount_to_purchase`, `updated_at`, `deleted_at`, `list_id`). There is no row↔record mapper. This corrects the spec, which used camelCase; existing components already read `item.amount_to_purchase`.
- **`pushDirty` runs before `pushOutbox`.** This reverses the spec's stated order. Item pushes omit `amount`/`amount_to_purchase` (see below), so a dirty push cannot mask a delta; and ops-first fails with a foreign-key violation for items created while offline.
- **Item pushes omit `amount` and `amount_to_purchase`.** Those columns are owned by the `item_ops` trigger. Upserting them from a client would clobber other devices' folded increments. New items are inserted with `0` and given `set` ops for their initial values.
- **No hard deletes on synced tables.** `remove()` sets `deleted_at`; every read filters `deleted_at === null`. Exception: `logs` is append-only and has no `deleted_at`.
- **`users.ai` and `users.free_ai_calls` are never written by the client.** They are a server-enforced quota; `/api/recipe` is the only writer.
- **All IDs are client-generated UUIDs** via `crypto.randomUUID()`.
- **Package manager is pnpm.** Node scripts run as `pnpm <script>`.
- **Aliases:** `~~/` is the repo root (so `~~/utils/db`, `~~/types/sync`), `~/` is `app/`.

---

## File Structure

**Local data layer (repo root, mirrors the reference implementation):**

| File | Responsibility |
|---|---|
| `types/sync.ts` | Record interfaces for every synced entity + `PendingOp` |
| `utils/db.ts` | Dexie schema and typed table handles |
| `utils/sync-state.ts` | `syncState` singleton accessors and per-table cursors |
| `utils/sync-hook.ts` | The local-change callback the engine installs |
| `utils/sync-merge.ts` | `remoteWins()` — the LWW rule |
| `utils/ops.ts` | Op construction and folding (`applyOps`) |
| `utils/sync-registry.ts` | Table registry: local↔remote names, cursor field, push omissions |
| `utils/export.ts` | Export payload construction and import validation |
| `utils/download.ts` | Browser file download helper |

**Sync engine and repositories (`app/`):**

| File | Responsibility |
|---|---|
| `app/composables/useSyncEngine.ts` | push/pull/merge/Realtime loop and status |
| `app/composables/useSyncBootstrap.ts` | Starts the engine on app load; account-mismatch wipe |
| `app/composables/useLists.ts` | Live list collection + list mutations |
| `app/composables/useItems.ts` | Live item collections + item mutations (ops) |
| `app/composables/useLogs.ts` | Live log feed + append + local pruning |
| `app/composables/useRecipes.ts` | Live recipes + mutations |
| `app/composables/useUserSettings.ts` | Live synced prefs; read-only quota cache |

**Backend:**

| File | Responsibility |
|---|---|
| `supabase/schema-v2.sql` | v2 tables, RLS, `can_access_list()`, owner guard, op trigger |
| `supabase/backfill-v2.sql` | One-shot backfill from the legacy tables |
| `supabase/verify-v2.sql` | Pre-cutover verification queries |
| `server/api/list/share.post.ts` | Mint a share token |
| `server/api/list/join.post.ts` | Redeem a share token (service role) |

**UI:**

| File | Responsibility |
|---|---|
| `app/pages/join.vue` | Token redemption landing page |
| `app/components/lists/ShareListModal.vue` | QR display + in-app scanner |
| `app/components/settings/DataSection.vue` | Export / import / clear local data |
| `app/components/sync/SyncStatus.vue` | Status indicator + last-synced |

**Deleted by this plan:** `app/store/invites.ts`, `app/components/lists/InviteButton.vue`, `server/api/invite.ts`, `server/api/list.ts`.

---

## Task 1: Test tooling

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Test: `tests/unit/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `pnpm test`. Every later task's tests import from `~~/utils/*` and rely on `fake-indexeddb` being installed globally by `tests/setup.ts`.

- [ ] **Step 1: Install dev dependencies**

```bash
pnpm add -D vitest@^4 @vitest/coverage-v8@^4 fake-indexeddb@^6 happy-dom@^20 @vue/test-utils@^2 vite-tsconfig-paths@^5
pnpm add dexie@^4
```

- [ ] **Step 2: Add test scripts to `package.json`**

Add to the `scripts` block:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('./', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url))
    }
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    globals: true
  }
});
```

- [ ] **Step 4: Create `tests/setup.ts`**

`fake-indexeddb/auto` installs a working IndexedDB onto `globalThis`, which Dexie needs. `structuredClone` is missing from some happy-dom builds and Dexie uses it.

```ts
import 'fake-indexeddb/auto';

if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (v: unknown) => JSON.parse(JSON.stringify(v));
}
```

- [ ] **Step 5: Write the smoke test**

```ts
// tests/unit/smoke.test.ts
import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('has indexedDB available', () => {
    expect(typeof indexedDB).toBe('object');
  });

  it('has crypto.randomUUID available', () => {
    expect(crypto.randomUUID()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
```

- [ ] **Step 6: Run the test**

Run: `pnpm test`
Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts tests/
git commit -m "test: add vitest + fake-indexeddb harness"
```

---

## Task 2: Supabase v2 schema and RLS

**Files:**
- Create: `supabase/schema-v2.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `lists_v2`, `list_members`, `list_share_tokens`, `items_v2`, `item_ops`, `logs_v2`, `recipes_v2`, `user_settings`; function `is_list_member(uuid) returns boolean`. Task 5 mirrors these column names exactly in Dexie. Task 10's pull queries `select *` from them.

**Context:** This task only *adds* tables. The legacy `items`/`lists`/`invites`/`logs`/`recipes` tables are untouched and the running app keeps working. Run the SQL in the Supabase Dashboard → SQL Editor.

- [ ] **Step 1: Write the table definitions**

```sql
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
```

- [ ] **Step 2: Write the membership helper**

This must be `security definer`. Without it, the `lists_v2` policy queries `list_members`, whose own policy queries `lists_v2`, and Postgres recurses until it errors.

```sql
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
```

An owner check is needed too. RLS evaluates `WITH CHECK` before the new tuple
exists, so a brand-new list has no `list_members` row for `is_list_member` to
find — without this, a list's creator could never insert their own first
membership row and every list would stay permanently memberless. It is
`security definer` for the same reason: reading `lists_v2` from inside a policy
would otherwise re-enter that table's own policy.

```sql
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
```

Every list-scoped policy goes through one predicate rather than repeating
`owner or member`. The owner arm is load-bearing: the sync engine's
write-through path pushes a single collection at a time, so an item write can
reach the server before its list's membership row has synced.

```sql
create or replace function public.can_access_list(target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_list_owner(target) or public.is_list_member(target);
$$;
```

`owner` is the root of list authority, and the UPDATE policy below has no way to
express "unchanged" — RLS `WITH CHECK` sees only the new row. Without this guard
any member could reassign ownership to themselves. No product feature transfers
ownership, so forbid the change outright.

```sql
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
```

- [ ] **Step 3: Write the RLS policies**

```sql
alter table public.lists_v2          enable row level security;
alter table public.list_members      enable row level security;
alter table public.list_share_tokens enable row level security;
alter table public.items_v2          enable row level security;
alter table public.item_ops          enable row level security;
alter table public.logs_v2           enable row level security;
alter table public.recipes_v2        enable row level security;
alter table public.user_settings     enable row level security;

-- lists: INSERT establishes the list, so it is gated on ownership rather than
-- on list-scoped access.
create policy "member reads list"   on public.lists_v2 for select using (can_access_list(id));
create policy "member updates list" on public.lists_v2 for update using (can_access_list(id));
create policy "owner creates list"  on public.lists_v2 for insert with check (owner = auth.uid());

-- members: readable by anyone with list access; UPDATE is deliberately
-- narrower — the owner manages anyone, everyone else edits or leaves only
-- their own row. The explicit `with check` matters: without it the USING
-- expression is reused and a user could hand their row to someone else.
create policy "member reads members"  on public.list_members for select using (can_access_list(list_id));
create policy "member adds members"   on public.list_members for insert with check (can_access_list(list_id));
create policy "member writes members" on public.list_members
  for update
  using (is_list_owner(list_id) or user_id = auth.uid())
  with check (is_list_owner(list_id) or user_id = auth.uid());

-- share tokens
create policy "member reads tokens"   on public.list_share_tokens for select using (can_access_list(list_id));
create policy "member mints tokens"   on public.list_share_tokens for insert with check (can_access_list(list_id));
create policy "member revokes tokens" on public.list_share_tokens for update using (can_access_list(list_id));

-- list-scoped data
create policy "member reads items"   on public.items_v2 for select using (can_access_list(list_id));
create policy "member writes items"  on public.items_v2 for update using (can_access_list(list_id));
create policy "member adds items"    on public.items_v2 for insert with check (can_access_list(list_id));

create policy "member reads ops"     on public.item_ops for select using (can_access_list(list_id));
create policy "member adds ops"      on public.item_ops for insert with check (can_access_list(list_id));

create policy "member reads logs"    on public.logs_v2 for select using (can_access_list(list_id));
create policy "member adds logs"     on public.logs_v2 for insert with check (can_access_list(list_id));

-- per-user data. NOT `for all` — that includes DELETE, and this project has no
-- hard deletes on synced tables; deletion is `deleted_at`.
create policy "own recipes read"   on public.recipes_v2 for select using (user_id = auth.uid());
create policy "own recipes insert" on public.recipes_v2 for insert with check (user_id = auth.uid());
create policy "own recipes update" on public.recipes_v2 for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own settings read"   on public.user_settings for select using (user_id = auth.uid());
create policy "own settings insert" on public.user_settings for insert with check (user_id = auth.uid());
create policy "own settings update" on public.user_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 4: Enable Realtime**

```sql
alter publication supabase_realtime add table public.lists_v2;
alter publication supabase_realtime add table public.list_members;
alter publication supabase_realtime add table public.items_v2;
alter publication supabase_realtime add table public.logs_v2;
alter publication supabase_realtime add table public.recipes_v2;
alter publication supabase_realtime add table public.user_settings;
```

- [ ] **Step 5: Apply the schema**

Paste `supabase/schema-v2.sql` into the Supabase SQL editor and run it.
Expected: `Success. No rows returned`.

- [ ] **Step 6: Verify RLS as two users**

In the SQL editor, impersonate each of two real user IDs from `auth.users` and confirm isolation. Substitute actual UUIDs:

```sql
-- expect: 0 rows, because no list_members rows exist yet
set local role authenticated;
set local request.jwt.claims = '{"sub":"<USER_A_UUID>","role":"authenticated"}';
select count(*) from lists_v2;
```

Expected: `0`, and **no** `stack depth limit exceeded` error. That error means `is_list_member` was created without `security definer` — go back to Step 2.

- [ ] **Step 7: Regenerate the stale type definitions**

`types/database.types.ts` currently describes an `items` table with columns production no longer has, and a `purchased` table that no longer exists.

```bash
pnpm dlx supabase gen types typescript --project-id <PROJECT_ID> > types/database.types.ts
```

- [ ] **Step 8: Commit**

```bash
git add supabase/schema-v2.sql types/database.types.ts
git commit -m "feat: add v2 sync schema, RLS and membership helper"
```

---

## Task 3: The item op trigger and compaction

**Files:**
- Modify: `supabase/schema-v2.sql` (append)

**Interfaces:**
- Consumes: `items_v2`, `item_ops` from Task 2.
- Produces: a trigger that folds each inserted `item_ops` row into `items_v2.amount` / `items_v2.amount_to_purchase` and bumps `updated_at`. Task 14 relies on this being the *only* writer of those two columns.

- [ ] **Step 1: Write the fold function**

```sql
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
```

- [ ] **Step 2: Add the compaction function**

Ops are already folded into the materialized columns, so deleting old ones is pure garbage collection.

```sql
create or replace function public.compact_item_ops()
returns void
language sql
as $$
  delete from public.item_ops where created_at < now() - interval '7 days';
$$;
```

- [ ] **Step 3: Apply and test the trigger by hand**

Run in the SQL editor against a scratch list and item:

```sql
insert into lists_v2 (id, name, owner) values ('11111111-1111-1111-1111-111111111111', 'scratch', auth.uid());
insert into items_v2 (id, list_id, name) values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'milk');

insert into item_ops (id, item_id, list_id, field, kind, value)
values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'amount', 'delta', 1),
       (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'amount', 'delta', 1);

select amount from items_v2 where id = '22222222-2222-2222-2222-222222222222';
```

Expected: `2` — this is the concurrent-increment property the whole design exists for. If it returns `1`, the trigger is `for each statement` instead of `for each row`.

- [ ] **Step 4: Verify `set` overrides rather than accumulates**

```sql
insert into item_ops (id, item_id, list_id, field, kind, value)
values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'amount', 'set', 10);
select amount from items_v2 where id = '22222222-2222-2222-2222-222222222222';
```

Expected: `10`.

- [ ] **Step 5: Clean up the scratch rows**

```sql
delete from lists_v2 where id = '11111111-1111-1111-1111-111111111111';
```

- [ ] **Step 6: Schedule compaction**

In Supabase Dashboard → Database → Cron (pg_cron), add a daily job:

```sql
select cron.schedule('compact-item-ops', '0 3 * * *', 'select public.compact_item_ops()');
```

- [ ] **Step 7: Commit**

```bash
git add supabase/schema-v2.sql
git commit -m "feat: fold item ops into materialized amounts via trigger"
```

---

## Task 4: Backfill and verification

**Files:**
- Create: `supabase/backfill-v2.sql`
- Create: `supabase/verify-v2.sql`

**Interfaces:**
- Consumes: the v2 tables from Task 2; the legacy `lists`, `items`, `logs`, `recipes` tables.
- Produces: every legacy row present in v2 with `legacy_id` (or `legacy_index`) retained. Nothing in later tasks reads `legacy_id`; it exists so this pass is auditable and re-runnable.

**Context:** Read-only against the legacy tables. Re-runnable: truncate the v2 tables and run again if a problem surfaces.

- [ ] **Step 1: Write the lists and members backfill**

```sql
-- supabase/backfill-v2.sql
-- One-shot migration from the legacy tables. Re-runnable after truncating v2.

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
```

- [ ] **Step 2: Write the items backfill**

`items.user` holds an email and maps to `created_by`. `times_updated` and `last_updated` are deliberately not carried over — `updated_at` subsumes the latter.

```sql
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
```

- [ ] **Step 3: Write the logs and recipes backfill**

```sql
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
```

- [ ] **Step 4: Write the settings backfill**

Only the user-owned preferences move. `ai` and `free_ai_calls` stay on `users`.

```sql
insert into user_settings (id, user_id, servings, allergies, cuisines,
                           show_empty_items, no_inventory, updated_at)
select gen_random_uuid(), u.id, coalesce(u.servings, 1),
       coalesce(u.allergies, ''), coalesce(u.cuisines, ''),
       coalesce(u.show_empty_items, true), coalesce(u.no_inventory, false),
       now()
from users u
on conflict (user_id) do nothing;

commit;
```

- [ ] **Step 5: Write the verification queries**

```sql
-- supabase/verify-v2.sql
-- All five must return the stated result before cutover (Task 13).

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
--    These sync once they sign up (see Step 6).
select email from list_members where user_id is null;

-- 5. Every list has at least one admin. Expect 0.
select l.id, l.name from lists_v2 l
 where not exists (
   select 1 from list_members m
    where m.list_id = l.id and m.role = 'admin' and m.deleted_at is null
 );
```

- [ ] **Step 6: Add the login claim trigger**

A member email with no `auth.users` row lands with `user_id null`. This claims those rows if that person ever signs up.

```sql
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
```

- [ ] **Step 7: Run the backfill, then the verification**

Run `backfill-v2.sql`, then `verify-v2.sql`.
Expected: queries 1, 2, 3 and 5 all return `0`. Query 4 may return rows; record them.

If any check fails: `truncate lists_v2 cascade; truncate recipes_v2; truncate user_settings;` and re-run after fixing. The cascade clears members, items, ops and logs.

- [ ] **Step 8: Commit**

```bash
git add supabase/backfill-v2.sql supabase/verify-v2.sql
git commit -m "feat: backfill legacy tables into v2 schema"
```

---

## Task 5: Record types and Dexie schema

**Files:**
- Create: `types/sync.ts`
- Create: `utils/db.ts`
- Test: `tests/unit/db.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `types/sync.ts` exports interfaces `SyncRecord`, `ListRecord`, `ListMemberRecord`, `ItemRecord`, `LogRecord`, `RecipeRecord`, `UserSettingsRecord`, `PendingOp`, `SyncStateRow`.
  - `utils/db.ts` exports `db` with stores `lists`, `list_members`, `items`, `logs`, `recipes`, `user_settings`, `pendingOps`, `syncState`.

**Context:** Fooderino has no existing Dexie database, so version 1 already has string UUID primary keys. The reference implementation's painful multi-version PK migration is not needed here.

- [ ] **Step 1: Write the record types**

```ts
// types/sync.ts

/** Every LWW-synced record carries these three fields. */
export interface SyncRecord {
  id: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ListRecord extends SyncRecord {
  name: string;
  owner: string;
}

export interface ListMemberRecord extends SyncRecord {
  list_id: string;
  user_id: string | null;
  email: string;
  name: string | null;
  avatar: string | null;
  role: 'admin' | 'member';
}

export interface ItemRecord extends SyncRecord {
  list_id: string;
  name: string;
  location: string;
  store: string;
  amount: number;
  amount_to_purchase: number;
  amount_type: string;
  default_amount: number;
  created_by: string | null;
}

/** Append-only: no updated_at, no deleted_at, never merged. */
export interface LogRecord {
  id: string;
  list_id: string;
  actor_email: string | null;
  item_name: string | null;
  action: string | null;
  payload: string | null;
  created_at: string;
}

export interface RecipeIngredient {
  name: string;
  amount?: number;
  amount_type: 'count' | 'gram';
}

export interface RecipeRecord extends SyncRecord {
  user_id: string;
  name: string;
  description: string | null;
  ingredients: RecipeIngredient[];
  instructions: string | null;
  saved: boolean;
}

export interface UserSettingsRecord extends SyncRecord {
  user_id: string;
  servings: number;
  allergies: string;
  cuisines: string;
  show_empty_items: boolean;
  no_inventory: boolean;
}

export type OpField = 'amount' | 'amount_to_purchase';
export type OpKind = 'delta' | 'set';

/** A counter mutation awaiting push. Local-only; never pulled. */
export interface PendingOp {
  id: string;
  item_id: string;
  list_id: string;
  field: OpField;
  kind: OpKind;
  value: number;
  actor: string | null;
  created_at: string;
}

/** Local-only singleton. `cursors` is keyed by the registry's `local` name. */
export interface SyncStateRow {
  key: string;
  device_id: string;
  user_id: string | null;
  hydrated_at: string | null;
  cursors: Record<string, { pulled: string | null; pushed: string | null }>;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '~~/utils/db';

describe('db', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('stores and reads back an item by its string uuid', async () => {
    const id = crypto.randomUUID();
    await db.items.add({
      id,
      list_id: 'list-1',
      name: 'milk',
      location: 'fridge',
      store: 'aldi',
      amount: 0,
      amount_to_purchase: 0,
      amount_type: 'count',
      default_amount: 1,
      created_by: null,
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null
    });

    const found = await db.items.get(id);
    expect(found?.name).toBe('milk');
  });

  it('indexes items by list_id', async () => {
    const base = {
      location: '', store: '', amount: 0, amount_to_purchase: 0,
      amount_type: 'count', default_amount: 1, created_by: null,
      updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null
    };
    await db.items.bulkAdd([
      { ...base, id: crypto.randomUUID(), list_id: 'a', name: 'milk' },
      { ...base, id: crypto.randomUUID(), list_id: 'b', name: 'eggs' }
    ]);

    const inA = await db.items.where('list_id').equals('a').toArray();
    expect(inA.map((i) => i.name)).toEqual(['milk']);
  });

  it('queries pending ops in insertion order', async () => {
    await db.pendingOps.bulkAdd([
      { id: 'op-2', item_id: 'i', list_id: 'l', field: 'amount', kind: 'delta', value: 1, actor: null, created_at: '2026-01-01T00:00:02.000Z' },
      { id: 'op-1', item_id: 'i', list_id: 'l', field: 'amount', kind: 'delta', value: 1, actor: null, created_at: '2026-01-01T00:00:01.000Z' }
    ]);

    const ordered = await db.pendingOps.orderBy('created_at').toArray();
    expect(ordered.map((o) => o.id)).toEqual(['op-1', 'op-2']);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test tests/unit/db.test.ts`
Expected: FAIL — cannot resolve `~~/utils/db`.

- [ ] **Step 4: Write the Dexie schema**

Only indexed fields are listed in `stores()`; the rest of each record is stored regardless.

```ts
// utils/db.ts
import Dexie, { type EntityTable } from 'dexie';
import type {
  ListRecord, ListMemberRecord, ItemRecord, LogRecord,
  RecipeRecord, UserSettingsRecord, PendingOp, SyncStateRow
} from '~~/types/sync';

const db = new Dexie('FooderinoDB') as Dexie & {
  lists: EntityTable<ListRecord, 'id'>;
  list_members: EntityTable<ListMemberRecord, 'id'>;
  items: EntityTable<ItemRecord, 'id'>;
  logs: EntityTable<LogRecord, 'id'>;
  recipes: EntityTable<RecipeRecord, 'id'>;
  user_settings: EntityTable<UserSettingsRecord, 'id'>;
  pendingOps: EntityTable<PendingOp, 'id'>;
  syncState: EntityTable<SyncStateRow, 'key'>;
};

db.version(1).stores({
  lists: 'id, updated_at, deleted_at',
  list_members: 'id, list_id, user_id, updated_at, deleted_at',
  items: 'id, list_id, name, updated_at, deleted_at',
  logs: 'id, list_id, created_at',
  recipes: 'id, user_id, updated_at, deleted_at',
  user_settings: 'id, user_id, updated_at, deleted_at',
  pendingOps: 'id, item_id, created_at',
  syncState: 'key'
});

export { db };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test tests/unit/db.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add types/sync.ts utils/db.ts tests/unit/db.test.ts
git commit -m "feat: add local record types and Dexie schema"
```

---

## Task 6: The merge rule

**Files:**
- Create: `utils/sync-merge.ts`
- Test: `tests/unit/sync-merge.test.ts`

**Interfaces:**
- Consumes: `SyncRecord` from `~~/types/sync`.
- Produces: `remoteWins(local: SyncRecord | undefined, remote: { updated_at: string }): boolean`. Task 10's merge path and Task 11's Realtime handler both call it.

**Context:** ISO-8601 UTC strings sort lexicographically in the same order they sort chronologically, so a plain `>` comparison is correct and avoids `Date` parsing on every merged row. This only holds if every timestamp is UTC with the same precision — everything is written by `new Date().toISOString()` or Postgres `now()` serialized as UTC.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/sync-merge.test.ts
import { describe, it, expect } from 'vitest';
import { remoteWins } from '~~/utils/sync-merge';

const rec = (updated_at: string, deleted_at: string | null = null) => ({
  id: 'x', updated_at, deleted_at
});

describe('remoteWins', () => {
  it('accepts a remote record we have never seen', () => {
    expect(remoteWins(undefined, { updated_at: '2026-01-01T00:00:00.000Z' })).toBe(true);
  });

  it('accepts a strictly newer remote record', () => {
    expect(remoteWins(rec('2026-01-01T00:00:00.000Z'), { updated_at: '2026-01-02T00:00:00.000Z' })).toBe(true);
  });

  it('rejects an older remote record', () => {
    expect(remoteWins(rec('2026-01-02T00:00:00.000Z'), { updated_at: '2026-01-01T00:00:00.000Z' })).toBe(false);
  });

  it('rejects an identical timestamp, so a pull of our own push is a no-op', () => {
    expect(remoteWins(rec('2026-01-01T00:00:00.000Z'), { updated_at: '2026-01-01T00:00:00.000Z' })).toBe(false);
  });

  it('lets a newer tombstone win over a live local record', () => {
    const local = rec('2026-01-01T00:00:00.000Z');
    const remote = { updated_at: '2026-01-02T00:00:00.000Z', deleted_at: '2026-01-02T00:00:00.000Z' };
    expect(remoteWins(local, remote)).toBe(true);
  });

  it('lets a newer live record win over a local tombstone, so delete-then-undelete works', () => {
    const local = rec('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    expect(remoteWins(local, { updated_at: '2026-01-02T00:00:00.000Z' })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/sync-merge.test.ts`
Expected: FAIL — cannot resolve `~~/utils/sync-merge`.

- [ ] **Step 3: Write the implementation**

```ts
// utils/sync-merge.ts
import type { SyncRecord } from '~~/types/sync';

/**
 * Last-write-wins by `updated_at`. Tombstones carry no special weight: a
 * deletion is just a write, so whichever side wrote last wins either way.
 *
 * Equal timestamps lose, which makes pulling back a row we just pushed a
 * no-op rather than a redundant write.
 */
export function remoteWins(
  local: SyncRecord | undefined,
  remote: { updated_at: string }
): boolean {
  if (!local) return true;
  return remote.updated_at > local.updated_at;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/sync-merge.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add utils/sync-merge.ts tests/unit/sync-merge.test.ts
git commit -m "feat: add last-write-wins merge rule"
```

---

## Task 7: Op construction and folding

**Files:**
- Create: `utils/ops.ts`
- Test: `tests/unit/ops.test.ts`

**Interfaces:**
- Consumes: `ItemRecord`, `PendingOp`, `OpField`, `OpKind` from `~~/types/sync`.
- Produces:
  - `makeOp(input: { item_id, list_id, field, kind, value, actor }): PendingOp`
  - `applyOps(item: ItemRecord, ops: PendingOp[]): ItemRecord`
  Task 10's pull path calls `applyOps` to replay unpushed ops over a freshly pulled row; Task 14's mutations call `makeOp`.

**Context:** `applyOps` is the pull reconciliation rule from the spec. Without it, a pull landing between a tap and its push briefly shows the pre-tap number and the tap looks lost.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/ops.test.ts
import { describe, it, expect } from 'vitest';
import { makeOp, applyOps } from '~~/utils/ops';
import type { ItemRecord, PendingOp } from '~~/types/sync';

const item = (over: Partial<ItemRecord> = {}): ItemRecord => ({
  id: 'item-1', list_id: 'list-1', name: 'milk', location: '', store: '',
  amount: 0, amount_to_purchase: 0, amount_type: 'count', default_amount: 1,
  created_by: null, updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
  ...over
});

const op = (over: Partial<PendingOp>): PendingOp => ({
  id: crypto.randomUUID(), item_id: 'item-1', list_id: 'list-1',
  field: 'amount', kind: 'delta', value: 1, actor: null,
  created_at: '2026-01-01T00:00:00.000Z',
  ...over
});

describe('makeOp', () => {
  it('assigns a uuid and an ISO timestamp', () => {
    const o = makeOp({ item_id: 'i', list_id: 'l', field: 'amount', kind: 'delta', value: 1, actor: 'a@b.c' });
    expect(o.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(o.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});

describe('applyOps', () => {
  it('returns the item unchanged when there are no ops', () => {
    expect(applyOps(item({ amount: 5 }), []).amount).toBe(5);
  });

  it('sums concurrent deltas — the property the whole design exists for', () => {
    const result = applyOps(item({ amount: 3 }), [
      op({ value: 1, created_at: '2026-01-01T00:00:01.000Z' }),
      op({ value: 1, created_at: '2026-01-01T00:00:02.000Z' })
    ]);
    expect(result.amount).toBe(5);
  });

  it('applies a set as a replacement, discarding what came before it', () => {
    const result = applyOps(item({ amount: 3 }), [
      op({ value: 1, created_at: '2026-01-01T00:00:01.000Z' }),
      op({ kind: 'set', value: 10, created_at: '2026-01-01T00:00:02.000Z' })
    ]);
    expect(result.amount).toBe(10);
  });

  it('applies a delta that arrives after a set on top of it', () => {
    const result = applyOps(item({ amount: 3 }), [
      op({ kind: 'set', value: 10, created_at: '2026-01-01T00:00:01.000Z' }),
      op({ value: 2, created_at: '2026-01-01T00:00:02.000Z' })
    ]);
    expect(result.amount).toBe(12);
  });

  it('orders by created_at, not array position', () => {
    const result = applyOps(item({ amount: 0 }), [
      op({ value: 5, created_at: '2026-01-01T00:00:09.000Z' }),
      op({ kind: 'set', value: 1, created_at: '2026-01-01T00:00:01.000Z' })
    ]);
    expect(result.amount).toBe(6);
  });

  it('keeps the two counter fields independent', () => {
    const result = applyOps(item({ amount: 1, amount_to_purchase: 1 }), [
      op({ field: 'amount_to_purchase', value: 4 })
    ]);
    expect(result.amount).toBe(1);
    expect(result.amount_to_purchase).toBe(5);
  });

  it('ignores ops belonging to a different item', () => {
    const result = applyOps(item({ amount: 1 }), [op({ item_id: 'other', value: 99 })]);
    expect(result.amount).toBe(1);
  });

  it('does not mutate the input item', () => {
    const original = item({ amount: 1 });
    applyOps(original, [op({ value: 1 })]);
    expect(original.amount).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/ops.test.ts`
Expected: FAIL — cannot resolve `~~/utils/ops`.

- [ ] **Step 3: Write the implementation**

```ts
// utils/ops.ts
import type { ItemRecord, PendingOp, OpField, OpKind } from '~~/types/sync';

export function makeOp(input: {
  item_id: string;
  list_id: string;
  field: OpField;
  kind: OpKind;
  value: number;
  actor: string | null;
}): PendingOp {
  return { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...input };
}

/**
 * Replays unpushed local ops over a freshly pulled item row.
 *
 * The server's `amount` already reflects every op it has received. Ops still
 * sitting in `pendingOps` have not reached it, so they are applied on top —
 * otherwise a pull landing mid-flight would render the pre-tap value and the
 * user's tap would look lost.
 *
 * Ordering is by `created_at`, not array position, because a `set` must
 * discard the deltas that preceded it and keep the ones that followed.
 */
export function applyOps(item: ItemRecord, ops: PendingOp[]): ItemRecord {
  const mine = ops
    .filter((o) => o.item_id === item.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (mine.length === 0) return item;

  const next: ItemRecord = { ...item };
  for (const o of mine) {
    const field: OpField = o.field;
    next[field] = o.kind === 'delta' ? next[field] + o.value : o.value;
  }
  return next;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/ops.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add utils/ops.ts tests/unit/ops.test.ts
git commit -m "feat: add counter op construction and folding"
```

---

## Task 8: Sync state and the local-change hook

**Files:**
- Create: `utils/sync-state.ts`
- Create: `utils/sync-hook.ts`
- Test: `tests/unit/sync-state.test.ts`

**Interfaces:**
- Consumes: `db` from `~~/utils/db`; `SyncStateRow` from `~~/types/sync`.
- Produces:
  - `getSyncState(): Promise<SyncStateRow>` — creates the singleton on first call.
  - `setSyncState(patch: Partial<SyncStateRow>): Promise<void>`
  - `getCursor(table: string): Promise<{ pulled: string | null; pushed: string | null }>`
  - `setCursor(table: string, patch: { pulled?: string | null; pushed?: string | null }): Promise<void>`
  - `setLocalChangeHook(fn: LocalChangeHook | null): void`
  - `notifyLocalChange(collection: SyncCollection, id: string): void`
  - type `SyncCollection = 'lists' | 'list_members' | 'items' | 'logs' | 'recipes' | 'user_settings'`

**Context:** Cursors live inside one singleton row rather than a row per table so that advancing several of them is one write. `setCursor` uses a read-modify-write transaction because pulls for different tables run concurrently and would otherwise clobber each other's cursor updates.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/sync-state.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '~~/utils/db';
import { getSyncState, setSyncState, getCursor, setCursor } from '~~/utils/sync-state';

describe('sync state', () => {
  beforeEach(async () => {
    await db.open();
    await db.syncState.clear();
  });

  it('creates a singleton with a device id on first read', async () => {
    const state = await getSyncState();
    expect(state.device_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(state.user_id).toBeNull();
    expect(state.hydrated_at).toBeNull();
  });

  it('returns the same device id on a second read', async () => {
    const first = await getSyncState();
    const second = await getSyncState();
    expect(second.device_id).toBe(first.device_id);
  });

  it('patches without dropping untouched fields', async () => {
    const { device_id } = await getSyncState();
    await setSyncState({ user_id: 'user-1' });
    const state = await getSyncState();
    expect(state.user_id).toBe('user-1');
    expect(state.device_id).toBe(device_id);
  });

  it('returns null cursors for a table never synced', async () => {
    expect(await getCursor('items')).toEqual({ pulled: null, pushed: null });
  });

  it('advances one cursor field without clearing the other', async () => {
    await setCursor('items', { pulled: '2026-01-01T00:00:00.000Z' });
    await setCursor('items', { pushed: '2026-01-02T00:00:00.000Z' });
    expect(await getCursor('items')).toEqual({
      pulled: '2026-01-01T00:00:00.000Z',
      pushed: '2026-01-02T00:00:00.000Z'
    });
  });

  it('keeps cursors for different tables independent', async () => {
    await setCursor('items', { pulled: '2026-01-01T00:00:00.000Z' });
    await setCursor('lists', { pulled: '2026-02-02T00:00:00.000Z' });
    expect((await getCursor('items')).pulled).toBe('2026-01-01T00:00:00.000Z');
    expect((await getCursor('lists')).pulled).toBe('2026-02-02T00:00:00.000Z');
  });

  it('survives concurrent cursor writes without losing one', async () => {
    await Promise.all([
      setCursor('items', { pulled: '2026-01-01T00:00:00.000Z' }),
      setCursor('lists', { pulled: '2026-01-01T00:00:00.000Z' }),
      setCursor('logs', { pulled: '2026-01-01T00:00:00.000Z' })
    ]);
    const state = await getSyncState();
    expect(Object.keys(state.cursors).sort()).toEqual(['items', 'lists', 'logs']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/sync-state.test.ts`
Expected: FAIL — cannot resolve `~~/utils/sync-state`.

- [ ] **Step 3: Write `utils/sync-state.ts`**

```ts
// utils/sync-state.ts
import { db } from '~~/utils/db';
import type { SyncStateRow } from '~~/types/sync';

const SINGLETON = 'singleton';

export async function getSyncState(): Promise<SyncStateRow> {
  const existing = await db.syncState.get(SINGLETON);
  if (existing) return existing;

  const fresh: SyncStateRow = {
    key: SINGLETON,
    device_id: crypto.randomUUID(),
    user_id: null,
    hydrated_at: null,
    cursors: {}
  };
  await db.syncState.put(fresh);
  return fresh;
}

export async function setSyncState(patch: Partial<SyncStateRow>): Promise<void> {
  await db.transaction('rw', db.syncState, async () => {
    const current = await getSyncState();
    await db.syncState.put({ ...current, ...patch, key: SINGLETON });
  });
}

export async function getCursor(
  table: string
): Promise<{ pulled: string | null; pushed: string | null }> {
  const state = await getSyncState();
  return state.cursors[table] ?? { pulled: null, pushed: null };
}

/**
 * Read-modify-write inside a transaction. Pulls for different tables run
 * concurrently, and since all cursors share one row, a plain read-then-write
 * would let the last writer silently discard its peers' updates.
 */
export async function setCursor(
  table: string,
  patch: { pulled?: string | null; pushed?: string | null }
): Promise<void> {
  await db.transaction('rw', db.syncState, async () => {
    const current = await getSyncState();
    const existing = current.cursors[table] ?? { pulled: null, pushed: null };
    await db.syncState.put({
      ...current,
      cursors: { ...current.cursors, [table]: { ...existing, ...patch } }
    });
  });
}
```

- [ ] **Step 4: Write `utils/sync-hook.ts`**

```ts
// utils/sync-hook.ts

export type SyncCollection =
  | 'lists' | 'list_members' | 'items' | 'logs' | 'recipes' | 'user_settings';

export type LocalChangeHook = (collection: SyncCollection, id: string) => void;

let hook: LocalChangeHook | null = null;

/** Installed by the sync engine on start, cleared on stop. */
export function setLocalChangeHook(fn: LocalChangeHook | null): void {
  hook = fn;
}

/**
 * Called by every repository mutation. When no engine is running — signed
 * out, or before bootstrap — this is a no-op and the write stays local until
 * the next catch-up sweep picks it up by cursor.
 */
export function notifyLocalChange(collection: SyncCollection, id: string): void {
  hook?.(collection, id);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test tests/unit/sync-state.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add utils/sync-state.ts utils/sync-hook.ts tests/unit/sync-state.test.ts
git commit -m "feat: add sync state cursors and local-change hook"
```

---

## Task 9: The table registry

**Files:**
- Create: `utils/sync-registry.ts`
- Test: `tests/unit/sync-registry.test.ts`

**Interfaces:**
- Consumes: `db` from `~~/utils/db`; `SyncCollection` from `~~/utils/sync-hook`.
- Produces:
  - `interface SyncTableDef { local: SyncCollection; remote: string; cursor: 'updated_at' | 'created_at'; appendOnly: boolean; pushOmit: string[] }`
  - `SYNC_TABLES: SyncTableDef[]`
  - `tableFor(local: SyncCollection): Table` — the Dexie handle
  - `defFor(local: SyncCollection): SyncTableDef`
  Task 10 and Task 11 iterate `SYNC_TABLES` and never name a table directly.

**Context:** This is the one place that knows a local store maps to a differently-named remote table. It is also where the two rules that keep item counters correct are declared: `items.pushOmit` protects the trigger-owned columns, and `logs` gets a `created_at` cursor because it is append-only and has no `updated_at`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/sync-registry.test.ts
import { describe, it, expect } from 'vitest';
import { SYNC_TABLES, defFor, tableFor } from '~~/utils/sync-registry';

describe('sync registry', () => {
  it('maps every local store to its v2 remote table', () => {
    expect(defFor('lists').remote).toBe('lists_v2');
    expect(defFor('items').remote).toBe('items_v2');
    expect(defFor('logs').remote).toBe('logs_v2');
    expect(defFor('recipes').remote).toBe('recipes_v2');
    expect(defFor('list_members').remote).toBe('list_members');
    expect(defFor('user_settings').remote).toBe('user_settings');
  });

  it('omits the trigger-owned counter columns from item pushes', () => {
    expect(defFor('items').pushOmit).toEqual(['amount', 'amount_to_purchase']);
  });

  it('omits nothing from tables without trigger-owned columns', () => {
    expect(defFor('lists').pushOmit).toEqual([]);
  });

  it('uses created_at as the cursor for the append-only log table', () => {
    expect(defFor('logs').cursor).toBe('created_at');
    expect(defFor('logs').appendOnly).toBe(true);
  });

  it('uses updated_at for every LWW table', () => {
    for (const def of SYNC_TABLES.filter((d) => !d.appendOnly)) {
      expect(def.cursor).toBe('updated_at');
    }
  });

  it('resolves a Dexie handle for every registered table', () => {
    for (const def of SYNC_TABLES) {
      expect(tableFor(def.local).name).toBe(def.local);
    }
  });

  it('pushes lists before items, so an item never references a missing list', () => {
    const names = SYNC_TABLES.map((d) => d.local);
    expect(names.indexOf('lists')).toBeLessThan(names.indexOf('items'));
    expect(names.indexOf('lists')).toBeLessThan(names.indexOf('list_members'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/sync-registry.test.ts`
Expected: FAIL — cannot resolve `~~/utils/sync-registry`.

- [ ] **Step 3: Write the implementation**

```ts
// utils/sync-registry.ts
import type { Table } from 'dexie';
import { db } from '~~/utils/db';
import type { SyncCollection } from '~~/utils/sync-hook';

export interface SyncTableDef {
  /** Dexie store name. */
  local: SyncCollection;
  /** Supabase table name. */
  remote: string;
  /** Column the incremental pull and catch-up push page on. */
  cursor: 'updated_at' | 'created_at';
  /** Append-only tables never participate in LWW merge. */
  appendOnly: boolean;
  /** Columns stripped before push because the server owns them. */
  pushOmit: string[];
}

/**
 * Order matters: pushes walk this array in sequence, so a table must appear
 * after anything it holds a foreign key to. Items reference lists; members
 * reference lists.
 */
export const SYNC_TABLES: SyncTableDef[] = [
  { local: 'lists',         remote: 'lists_v2',      cursor: 'updated_at', appendOnly: false, pushOmit: [] },
  { local: 'list_members',  remote: 'list_members',  cursor: 'updated_at', appendOnly: false, pushOmit: [] },
  // `amount` and `amount_to_purchase` are owned by the item_ops trigger.
  // Upserting them here would overwrite increments other devices folded in.
  { local: 'items',         remote: 'items_v2',      cursor: 'updated_at', appendOnly: false, pushOmit: ['amount', 'amount_to_purchase'] },
  { local: 'logs',          remote: 'logs_v2',       cursor: 'created_at', appendOnly: true,  pushOmit: [] },
  { local: 'recipes',       remote: 'recipes_v2',    cursor: 'updated_at', appendOnly: false, pushOmit: [] },
  { local: 'user_settings', remote: 'user_settings', cursor: 'updated_at', appendOnly: false, pushOmit: [] }
];

const BY_LOCAL = new Map(SYNC_TABLES.map((d) => [d.local, d]));

export function defFor(local: SyncCollection): SyncTableDef {
  const def = BY_LOCAL.get(local);
  if (!def) throw new Error(`No sync table registered for "${local}"`);
  return def;
}

export function tableFor(local: SyncCollection): Table {
  return db.table(local);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/sync-registry.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add utils/sync-registry.ts tests/unit/sync-registry.test.ts
git commit -m "feat: add sync table registry"
```

---

## Task 10: The sync engine core

**Files:**
- Create: `utils/sync-engine.ts`
- Test: `tests/unit/sync-engine.test.ts`

**Interfaces:**
- Consumes: `db`, `SYNC_TABLES`/`tableFor`/`defFor`/`SyncTableDef`, `remoteWins`, `applyOps`, `getCursor`/`setCursor`.
- Produces:
  - `type Row = Record<string, unknown>`
  - `interface SyncTransport { fetchSince(table, cursorField, since, offset, limit): Promise<Row[]>; upsertRows(table, rows): Promise<void>; insertOp(op): Promise<'inserted' | 'duplicate'> }`
  - `const PAGE_SIZE = 1000`
  - `createSyncEngine(transport: SyncTransport)` returning `{ pushDirty, pushOutbox, pull, applyRemote, runOnce }`
  Task 11 supplies the real `SyncTransport` and wraps `runOnce`.

**Context:** The engine talks to a narrow `SyncTransport` port rather than to `supabase-js` directly. That keeps every merge rule unit-testable against an in-memory fake, and it is why this task needs no Nuxt runtime.

Note the order inside `runOnce`: **all dirty pushes, then ops, then pulls.** Ops reference item rows by foreign key, so an op for an item created while offline fails unless its item was pushed first. This reverses the spec's stated order — see Global Constraints.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/sync-engine.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '~~/utils/db';
import { defFor } from '~~/utils/sync-registry';
import { getCursor, setCursor } from '~~/utils/sync-state';
import { createSyncEngine, PAGE_SIZE, type Row, type SyncTransport } from '~~/utils/sync-engine';
import type { ItemRecord, PendingOp } from '~~/types/sync';

/** In-memory stand-in for Supabase. Records what was sent for assertions. */
function fakeTransport(seed: Record<string, Row[]> = {}) {
  const remote: Record<string, Row[]> = { ...seed };
  const upserted: { table: string; rows: Row[] }[] = [];
  const ops: PendingOp[] = [];
  let failOpsAfter = Number.POSITIVE_INFINITY;
  let duplicateIds = new Set<string>();

  const transport: SyncTransport = {
    async fetchSince(table, cursorField, since, offset, limit) {
      const all = (remote[table] ?? [])
        .filter((r) => !since || String(r[cursorField]) > since)
        .sort((a, b) => String(a[cursorField]).localeCompare(String(b[cursorField])));
      return all.slice(offset, offset + limit);
    },
    async upsertRows(table, rows) {
      upserted.push({ table, rows });
    },
    async insertOp(op) {
      if (ops.length >= failOpsAfter) throw new Error('network down');
      if (duplicateIds.has(op.id)) return 'duplicate';
      ops.push(op);
      return 'inserted';
    }
  };

  return {
    transport, upserted, ops,
    failOpsAfter: (n: number) => { failOpsAfter = n; },
    markDuplicate: (id: string) => duplicateIds.add(id)
  };
}

const item = (over: Partial<ItemRecord> = {}): ItemRecord => ({
  id: crypto.randomUUID(), list_id: 'list-1', name: 'milk', location: '', store: '',
  amount: 0, amount_to_purchase: 0, amount_type: 'count', default_amount: 1,
  created_by: null, updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
  ...over
});

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('pushDirty', () => {
  it('sends rows newer than the pushed cursor and skips the rest', async () => {
    await db.items.bulkAdd([
      item({ id: 'old', updated_at: '2026-01-01T00:00:00.000Z' }),
      item({ id: 'new', updated_at: '2026-01-03T00:00:00.000Z' })
    ]);
    await setCursor('items', { pushed: '2026-01-02T00:00:00.000Z' });

    const f = fakeTransport();
    await createSyncEngine(f.transport).pushDirty(defFor('items'));

    expect(f.upserted).toHaveLength(1);
    expect(f.upserted[0].rows.map((r) => r.id)).toEqual(['new']);
  });

  it('strips the trigger-owned counter columns from item pushes', async () => {
    await db.items.add(item({ id: 'a', amount: 7, amount_to_purchase: 3 }));

    const f = fakeTransport();
    await createSyncEngine(f.transport).pushDirty(defFor('items'));

    const sent = f.upserted[0].rows[0];
    expect(sent).not.toHaveProperty('amount');
    expect(sent).not.toHaveProperty('amount_to_purchase');
    expect(sent.name).toBe('milk');
  });

  it('advances the pushed cursor to the newest row sent', async () => {
    await db.items.bulkAdd([
      item({ id: 'a', updated_at: '2026-01-01T00:00:00.000Z' }),
      item({ id: 'b', updated_at: '2026-01-05T00:00:00.000Z' })
    ]);

    const f = fakeTransport();
    await createSyncEngine(f.transport).pushDirty(defFor('items'));

    expect((await getCursor('items')).pushed).toBe('2026-01-05T00:00:00.000Z');
  });

  it('sends nothing and leaves the cursor alone when no rows are dirty', async () => {
    const f = fakeTransport();
    await createSyncEngine(f.transport).pushDirty(defFor('items'));

    expect(f.upserted).toHaveLength(0);
    expect((await getCursor('items')).pushed).toBeNull();
  });
});

describe('pushOutbox', () => {
  const op = (over: Partial<PendingOp> = {}): PendingOp => ({
    id: crypto.randomUUID(), item_id: 'item-1', list_id: 'list-1',
    field: 'amount', kind: 'delta', value: 1, actor: null,
    created_at: '2026-01-01T00:00:00.000Z', ...over
  });

  it('sends queued ops oldest first and empties the queue', async () => {
    await db.pendingOps.bulkAdd([
      op({ id: 'second', created_at: '2026-01-01T00:00:02.000Z' }),
      op({ id: 'first', created_at: '2026-01-01T00:00:01.000Z' })
    ]);

    const f = fakeTransport();
    await createSyncEngine(f.transport).pushOutbox();

    expect(f.ops.map((o) => o.id)).toEqual(['first', 'second']);
    expect(await db.pendingOps.count()).toBe(0);
  });

  it('drops a duplicate op, because the server already folded it', async () => {
    await db.pendingOps.add(op({ id: 'dupe' }));

    const f = fakeTransport();
    f.markDuplicate('dupe');
    await createSyncEngine(f.transport).pushOutbox();

    expect(await db.pendingOps.count()).toBe(0);
  });

  it('keeps unsent ops queued when the transport throws', async () => {
    await db.pendingOps.bulkAdd([
      op({ id: 'a', created_at: '2026-01-01T00:00:01.000Z' }),
      op({ id: 'b', created_at: '2026-01-01T00:00:02.000Z' })
    ]);

    const f = fakeTransport();
    f.failOpsAfter(1);
    await expect(createSyncEngine(f.transport).pushOutbox()).rejects.toThrow('network down');

    expect(await db.pendingOps.toArray()).toHaveLength(1);
    expect((await db.pendingOps.toArray())[0].id).toBe('b');
  });
});

describe('pull', () => {
  it('writes rows we have never seen', async () => {
    const f = fakeTransport({
      items_v2: [{ ...item({ id: 'remote-1', name: 'eggs' }) }]
    });
    await createSyncEngine(f.transport).pull(defFor('items'));

    expect((await db.items.get('remote-1'))?.name).toBe('eggs');
  });

  it('does not overwrite a locally newer row', async () => {
    await db.items.add(item({ id: 'x', name: 'local', updated_at: '2026-01-05T00:00:00.000Z' }));
    const f = fakeTransport({
      items_v2: [{ ...item({ id: 'x', name: 'remote', updated_at: '2026-01-01T00:00:00.000Z' }) }]
    });

    await createSyncEngine(f.transport).pull(defFor('items'));

    expect((await db.items.get('x'))?.name).toBe('local');
  });

  it('replays unpushed ops on top of a pulled item', async () => {
    const f = fakeTransport({
      items_v2: [{ ...item({ id: 'x', amount: 5, updated_at: '2026-01-09T00:00:00.000Z' }) }]
    });
    await db.pendingOps.add({
      id: 'op-1', item_id: 'x', list_id: 'list-1', field: 'amount',
      kind: 'delta', value: 1, actor: null, created_at: '2026-01-09T00:00:01.000Z'
    });

    await createSyncEngine(f.transport).pull(defFor('items'));

    // Server says 5; our un-acked +1 must still show, or the tap looks lost.
    expect((await db.items.get('x'))?.amount).toBe(6);
  });

  it('pages past the row limit', async () => {
    const many = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => ({
      ...item({
        id: `id-${String(i).padStart(5, '0')}`,
        updated_at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`
      })
    }));
    const f = fakeTransport({ items_v2: many });

    await createSyncEngine(f.transport).pull(defFor('items'));

    expect(await db.items.count()).toBe(PAGE_SIZE + 5);
  });

  it('advances the pulled cursor to the newest row seen', async () => {
    const f = fakeTransport({
      items_v2: [
        { ...item({ id: 'a', updated_at: '2026-01-01T00:00:00.000Z' }) },
        { ...item({ id: 'b', updated_at: '2026-01-04T00:00:00.000Z' }) }
      ]
    });
    await createSyncEngine(f.transport).pull(defFor('items'));

    expect((await getCursor('items')).pulled).toBe('2026-01-04T00:00:00.000Z');
  });

  it('writes append-only log rows without consulting the merge rule', async () => {
    const f = fakeTransport({
      logs_v2: [{ id: 'log-1', list_id: 'l', actor_email: 'a@b.c', item_name: 'milk', action: 'created', payload: '', created_at: '2026-01-01T00:00:00.000Z' }]
    });
    await createSyncEngine(f.transport).pull(defFor('logs'));

    expect(await db.logs.count()).toBe(1);
    expect((await getCursor('logs')).pulled).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('runOnce', () => {
  it('pushes rows before ops, so an op never precedes the item it references', async () => {
    const order: string[] = [];
    const f = fakeTransport();
    const spy: SyncTransport = {
      fetchSince: f.transport.fetchSince,
      async upsertRows(t, r) { order.push(`upsert:${t}`); return f.transport.upsertRows(t, r); },
      async insertOp(o) { order.push('op'); return f.transport.insertOp(o); }
    };

    await db.items.add(item({ id: 'x' }));
    await db.pendingOps.add({
      id: 'op-1', item_id: 'x', list_id: 'list-1', field: 'amount',
      kind: 'set', value: 2, actor: null, created_at: '2026-01-01T00:00:00.000Z'
    });

    await createSyncEngine(spy).runOnce();

    expect(order.indexOf('upsert:items_v2')).toBeLessThan(order.indexOf('op'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/sync-engine.test.ts`
Expected: FAIL — cannot resolve `~~/utils/sync-engine`.

- [ ] **Step 3: Write the implementation**

```ts
// utils/sync-engine.ts
import { db } from '~~/utils/db';
import { SYNC_TABLES, tableFor, type SyncTableDef } from '~~/utils/sync-registry';
import { remoteWins } from '~~/utils/sync-merge';
import { applyOps } from '~~/utils/ops';
import { getCursor, setCursor } from '~~/utils/sync-state';
import type { ItemRecord, PendingOp, SyncRecord } from '~~/types/sync';

export type Row = Record<string, unknown>;

/**
 * The engine's only view of the network. Keeping it this narrow means every
 * merge rule below is testable against an in-memory fake, and swapping the
 * backend never touches this file.
 */
export interface SyncTransport {
  fetchSince(
    table: string,
    cursorField: string,
    since: string | null,
    offset: number,
    limit: number
  ): Promise<Row[]>;
  upsertRows(table: string, rows: Row[]): Promise<void>;
  /** Resolves 'duplicate' when the row already exists; throws on real errors. */
  insertOp(op: PendingOp): Promise<'inserted' | 'duplicate'>;
}

export const PAGE_SIZE = 1000;

function strip(row: Row, omit: string[]): Row {
  if (omit.length === 0) return { ...row };
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (!omit.includes(k)) out[k] = v;
  }
  return out;
}

export function createSyncEngine(transport: SyncTransport) {
  async function pushDirty(def: SyncTableDef): Promise<void> {
    const { pushed } = await getCursor(def.local);
    const all = (await tableFor(def.local).toArray()) as Row[];
    const dirty = all.filter((r) => !pushed || String(r[def.cursor]) > pushed);
    if (dirty.length === 0) return;

    await transport.upsertRows(def.remote, dirty.map((r) => strip(r, def.pushOmit)));

    let max = pushed;
    for (const r of dirty) {
      const v = String(r[def.cursor]);
      if (!max || v > max) max = v;
    }
    await setCursor(def.local, { pushed: max });
  }

  /**
   * Drains the op queue oldest-first. A throw aborts the loop with the
   * remaining ops still queued, so a dropped connection costs nothing.
   * A 'duplicate' means an earlier attempt did land and the server already
   * folded it — deleting locally is correct, not data loss.
   */
  async function pushOutbox(): Promise<void> {
    const ops = await db.pendingOps.orderBy('created_at').toArray();
    for (const op of ops) {
      await transport.insertOp(op);
      await db.pendingOps.delete(op.id);
    }
  }

  async function applyRemote(def: SyncTableDef, row: Row): Promise<void> {
    const id = row.id as string | undefined;
    if (!id) return;
    const table = tableFor(def.local);

    if (def.appendOnly) {
      await table.put(row);
      return;
    }

    const local = (await table.get(id)) as SyncRecord | undefined;
    if (!remoteWins(local, row as unknown as { updated_at: string })) return;

    if (def.local === 'items') {
      const pending = await db.pendingOps.where('item_id').equals(id).toArray();
      await table.put(applyOps(row as unknown as ItemRecord, pending));
      return;
    }
    await table.put(row);
  }

  async function pull(def: SyncTableDef): Promise<void> {
    const { pulled } = await getCursor(def.local);
    let max = pulled;

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const rows = await transport.fetchSince(def.remote, def.cursor, pulled, offset, PAGE_SIZE);
      for (const row of rows) {
        await applyRemote(def, row);
        const v = String(row[def.cursor]);
        if (!max || v > max) max = v;
      }
      if (rows.length < PAGE_SIZE) break;
    }

    await setCursor(def.local, { pulled: max });
  }

  /**
   * Dirty rows first, then ops, then pulls. Ops carry a foreign key to their
   * item, so an item created while offline must reach the server before any
   * op that references it. Pushing rows first is safe because item pushes
   * omit the counter columns and therefore cannot mask a pending delta.
   */
  async function runOnce(): Promise<void> {
    for (const def of SYNC_TABLES) await pushDirty(def);
    await pushOutbox();
    for (const def of SYNC_TABLES) await pull(def);
  }

  return { pushDirty, pushOutbox, pull, applyRemote, runOnce };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/sync-engine.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Run the whole suite**

Run: `pnpm test`
Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add utils/sync-engine.ts tests/unit/sync-engine.test.ts
git commit -m "feat: add transport-agnostic sync engine"
```

---

## Task 11: Supabase transport, Realtime and engine composable

**Files:**
- Create: `app/utils/supabase-transport.ts`
- Create: `app/composables/useSyncEngine.ts`
- Create: `app/components/sync/SyncStatus.vue`

**Interfaces:**
- Consumes: `createSyncEngine`, `SyncTransport`, `Row` from `~~/utils/sync-engine`; `SYNC_TABLES`, `defFor` from `~~/utils/sync-registry`; `setLocalChangeHook` from `~~/utils/sync-hook`.
- Produces:
  - `createSupabaseTransport(client: SupabaseClient): SyncTransport`
  - `useSyncEngine()` returning `{ status, lastSyncedAt, start, stop, syncNow }` where `status: Ref<'idle' | 'syncing' | 'offline' | 'error'>`, `lastSyncedAt: Ref<string | null>`, `start(): Promise<void>`, `stop(): void`, `syncNow(): Promise<void>`.
  Task 12 calls `start`/`stop`. Task 21's "clear local data" calls `syncNow`.

**Context:** Three details are lifted from the reference implementation because they were bugs there first: engine state lives in module-level singletons so a component remount can tear down the channel its predecessor opened; concurrent `start()` calls share one in-flight promise; and a throw during startup must land on `error`/`offline` rather than leaving the UI stuck on `syncing` forever.

- [ ] **Step 1: Write the Supabase transport**

Postgres error `23505` is `unique_violation` — for an op insert that means this exact op id already landed.

```ts
// app/utils/supabase-transport.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Row, SyncTransport } from '~~/utils/sync-engine';
import type { PendingOp } from '~~/types/sync';

export function createSupabaseTransport(client: SupabaseClient): SyncTransport {
  return {
    async fetchSince(table, cursorField, since, offset, limit) {
      let q = client
        .from(table)
        .select('*')
        .order(cursorField, { ascending: true })
        .range(offset, offset + limit - 1);
      if (since) q = q.gt(cursorField, since);

      const { data, error } = await q;
      if (error) throw new Error(`pull ${table}: ${error.message}`);
      return (data ?? []) as Row[];
    },

    async upsertRows(table, rows) {
      const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`push ${table}: ${error.message}`);
    },

    async insertOp(op: PendingOp) {
      const { error } = await client.from('item_ops').insert({
        id: op.id,
        item_id: op.item_id,
        list_id: op.list_id,
        field: op.field,
        kind: op.kind,
        value: op.value,
        actor: op.actor
      });
      // 23505 = unique_violation: this op id already landed, so the server
      // has already folded it. Reporting success lets the caller dequeue.
      if (error && error.code === '23505') return 'duplicate';
      if (error) throw new Error(`push op: ${error.message}`);
      return 'inserted';
    }
  };
}
```

- [ ] **Step 2: Write the engine composable**

```ts
// app/composables/useSyncEngine.ts
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createSyncEngine, type SyncEngine, type Row } from '~~/utils/sync-engine';
import { createSupabaseTransport } from '~/utils/supabase-transport';
import { SYNC_TABLES, defFor } from '~~/utils/sync-registry';
import { setLocalChangeHook } from '~~/utils/sync-hook';
import { db } from '~~/utils/db';

// Module-level, not function-local: SyncStatus and the bootstrap both call
// useSyncEngine(), and a remount must be able to tear down the channel a
// previous instance opened. Function-local state leaks duplicate
// subscriptions on the same topic.
let engine: SyncEngine | null = null;
let channels: RealtimeChannel[] = [];
let startInFlight: Promise<void> | null = null;

export function useSyncEngine() {
  const status = useState<'idle' | 'syncing' | 'offline' | 'error'>('sync-status', () => 'idle');
  const lastSyncedAt = useState<string | null>('sync-last', () => null);
  const supabase = useSupabaseClient();

  function markFailure(context: string, err?: unknown): void {
    status.value = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error';
    console.error(`[sync] ${context} failed`, err);
  }

  async function syncNow(): Promise<void> {
    if (!engine) return;
    status.value = 'syncing';
    try {
      await engine.runOnce();
      lastSyncedAt.value = new Date().toISOString();
      status.value = 'idle';
    } catch (e) {
      markFailure('sync', e);
    }
  }

  /** Push one record as soon as it changes, so edits land without waiting. */
  function installChangeHook(): void {
    setLocalChangeHook((collection) => {
      if (!engine) return;
      engine
        .pushDirty(defFor(collection))
        .then(() => engine?.pushOutbox())
        .then(() => {
          lastSyncedAt.value = new Date().toISOString();
          if (status.value !== 'syncing') status.value = 'idle';
        })
        .catch((e) => markFailure('write-through push', e));
    });
  }

  function subscribeRealtime(): void {
    for (const def of SYNC_TABLES) {
      const channel = supabase
        .channel(`sync:${def.remote}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: def.remote },
          (payload) => {
            engine
              ?.applyRemote(def, payload.new as Row)
              .catch((e) => markFailure(`realtime ${def.remote}`, e));
          }
        )
        .subscribe();
      channels.push(channel);
    }
  }

  async function runStart(): Promise<void> {
    stop();
    engine = createSyncEngine(createSupabaseTransport(supabase));
    status.value = 'syncing';
    installChangeHook();
    try {
      await engine.runOnce();
      subscribeRealtime();
      lastSyncedAt.value = new Date().toISOString();
      status.value = 'idle';
    } catch (e) {
      // Never leave the UI stuck on 'syncing'. A later write-through push or
      // a re-run of start() clears this back to idle.
      markFailure('start', e);
    }
  }

  async function start(): Promise<void> {
    if (startInFlight) return startInFlight;
    startInFlight = runStart().finally(() => {
      startInFlight = null;
    });
    return startInFlight;
  }

  function stop(): void {
    setLocalChangeHook(null);
    for (const c of channels) supabase.removeChannel(c);
    channels = [];
    engine = null;
  }

  return { status, lastSyncedAt, start, stop, syncNow };
}

/** Wipes every synced store. Used on account switch and by "clear local data". */
export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
```

- [ ] **Step 3: Write the status component**

```vue
<!-- app/components/sync/SyncStatus.vue -->
<script setup lang="ts">
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from 'lucide-vue-next';

const { status, lastSyncedAt, syncNow } = useSyncEngine();

const label = computed(() => {
  if (status.value === 'syncing') return 'Syncing…';
  if (status.value === 'offline') return 'Offline — changes are saved locally';
  if (status.value === 'error') return 'Sync error — tap to retry';
  return lastSyncedAt.value
    ? `Synced ${new Date(lastSyncedAt.value).toLocaleTimeString()}`
    : 'Synced';
});
</script>

<template>
  <button
    class="flex flex-row items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
    @click="syncNow">
    <RefreshCw v-if="status === 'syncing'" class="size-4 animate-spin" />
    <CloudOff v-else-if="status === 'offline'" class="size-4" />
    <TriangleAlert v-else-if="status === 'error'" class="size-4 text-red-500" />
    <Cloud v-else class="size-4" />
    <span>{{ label }}</span>
  </button>
</template>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm dlx nuxi typecheck`
Expected: no errors in the three new files. (Pre-existing errors elsewhere in the repo are out of scope.)

- [ ] **Step 5: Commit**

```bash
git add app/utils/supabase-transport.ts app/composables/useSyncEngine.ts app/components/sync/SyncStatus.vue
git commit -m "feat: add supabase transport, realtime and sync status"
```

---

## Task 12: Bootstrap, hydration gate and account switching

**Files:**
- Create: `app/composables/useSyncBootstrap.ts`
- Modify: `app/layouts/app.vue`
- Test: `tests/unit/account-switch.test.ts`

**Interfaces:**
- Consumes: `useSyncEngine`, `clearLocalData` from `~/composables/useSyncEngine`; `getSyncState`, `setSyncState` from `~~/utils/sync-state`.
- Produces:
  - `resolveAccountChange(incomingUserId: string | null): Promise<'same' | 'switched' | 'first-login'>` — exported from `~~/utils/account.ts` so it is testable without Nuxt.
  - `useSyncBootstrap()` — call once from the layout; returns `{ hydrated: Ref<boolean> }`.

**Context:** IndexedDB is per-origin, not per-account. Without the guard in this task, signing in as a second user on a shared browser shows them the first user's groceries.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/account-switch.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '~~/utils/db';
import { getSyncState, setSyncState, setCursor } from '~~/utils/sync-state';
import { resolveAccountChange } from '~~/utils/account';

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('resolveAccountChange', () => {
  it('reports first-login when no user has ever been recorded', async () => {
    expect(await resolveAccountChange('user-a')).toBe('first-login');
    expect((await getSyncState()).user_id).toBe('user-a');
  });

  it('reports same when the user is unchanged and keeps local data', async () => {
    await resolveAccountChange('user-a');
    await db.items.add({
      id: 'keep', list_id: 'l', name: 'milk', location: '', store: '',
      amount: 0, amount_to_purchase: 0, amount_type: 'count', default_amount: 1,
      created_by: null, updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null
    });

    expect(await resolveAccountChange('user-a')).toBe('same');
    expect(await db.items.count()).toBe(1);
  });

  it('wipes every synced store when a different user signs in', async () => {
    await resolveAccountChange('user-a');
    await db.items.add({
      id: 'gone', list_id: 'l', name: 'milk', location: '', store: '',
      amount: 0, amount_to_purchase: 0, amount_type: 'count', default_amount: 1,
      created_by: null, updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null
    });
    await setCursor('items', { pulled: '2026-01-01T00:00:00.000Z' });

    expect(await resolveAccountChange('user-b')).toBe('switched');
    expect(await db.items.count()).toBe(0);
  });

  it('resets cursors on switch, so the new account pulls from scratch', async () => {
    await resolveAccountChange('user-a');
    await setCursor('items', { pulled: '2026-01-01T00:00:00.000Z' });

    await resolveAccountChange('user-b');

    const state = await getSyncState();
    expect(state.cursors).toEqual({});
    expect(state.hydrated_at).toBeNull();
  });

  it('records the new user id after a switch', async () => {
    await resolveAccountChange('user-a');
    await resolveAccountChange('user-b');
    expect((await getSyncState()).user_id).toBe('user-b');
  });

  it('leaves local data intact on sign-out, so re-login is instant', async () => {
    await resolveAccountChange('user-a');
    await db.items.add({
      id: 'keep', list_id: 'l', name: 'milk', location: '', store: '',
      amount: 0, amount_to_purchase: 0, amount_type: 'count', default_amount: 1,
      created_by: null, updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null
    });

    expect(await resolveAccountChange(null)).toBe('same');
    expect(await db.items.count()).toBe(1);
  });

  it('preserves the device id across a switch', async () => {
    await resolveAccountChange('user-a');
    const before = (await getSyncState()).device_id;
    await resolveAccountChange('user-b');
    expect((await getSyncState()).device_id).toBe(before);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/account-switch.test.ts`
Expected: FAIL — cannot resolve `~~/utils/account`.

- [ ] **Step 3: Write `utils/account.ts`**

```ts
// utils/account.ts
import { db } from '~~/utils/db';
import { getSyncState, setSyncState } from '~~/utils/sync-state';

/**
 * Reconciles the signed-in account against whoever owns the local data.
 *
 * IndexedDB is scoped to the origin, not the account, so a shared browser
 * would otherwise show a second user the first user's data. On a switch we
 * wipe every synced store and reset the cursors so the new account pulls
 * from scratch. `device_id` survives, because it identifies the browser
 * rather than the person.
 *
 * A null incoming id means "signed out" and is deliberately a no-op: keeping
 * the data makes re-login instant, and the route guard blocks the UI anyway.
 */
export async function resolveAccountChange(
  incomingUserId: string | null
): Promise<'same' | 'switched' | 'first-login'> {
  const state = await getSyncState();

  if (incomingUserId === null) return 'same';
  if (state.user_id === incomingUserId) return 'same';

  if (state.user_id === null) {
    await setSyncState({ user_id: incomingUserId });
    return 'first-login';
  }

  const synced = db.tables.filter((t) => t.name !== 'syncState');
  await db.transaction('rw', synced, async () => {
    await Promise.all(synced.map((t) => t.clear()));
  });
  await setSyncState({ user_id: incomingUserId, cursors: {}, hydrated_at: null });
  return 'switched';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/account-switch.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the bootstrap composable**

```ts
// app/composables/useSyncBootstrap.ts
import { resolveAccountChange } from '~~/utils/account';
import { getSyncState, setSyncState } from '~~/utils/sync-state';

/**
 * Starts the engine for the whole session, from the layout rather than from
 * a settings component. Mounting it on a single route means writes made
 * elsewhere never sync until the user happens to visit that route.
 */
export function useSyncBootstrap() {
  const user = useSupabaseUser();
  const { start, stop } = useSyncEngine();
  const hydrated = useState<boolean>('sync-hydrated', () => false);

  async function boot(userId: string | null): Promise<void> {
    if (!userId) {
      stop();
      hydrated.value = false;
      return;
    }

    await resolveAccountChange(userId);
    hydrated.value = (await getSyncState()).hydrated_at !== null;

    await start();

    if (!hydrated.value) {
      await setSyncState({ hydrated_at: new Date().toISOString() });
      hydrated.value = true;
    }
  }

  onMounted(() => {
    void boot(user.value?.id ?? null);
  });

  watch(user, (u) => {
    void boot(u?.id ?? null);
  });

  return { hydrated };
}
```

- [ ] **Step 6: Call it from the layout**

In `app/layouts/app.vue`, replace the `<script setup>` block with:

```ts
withDefaults(defineProps<{ hideBorder?: boolean }>(), {
  hideBorder: true
});

const { hydrated } = useSyncBootstrap();
```

Then in the template, wrap the slot so the first-ever pull does not render as empty lists:

```vue
      <div class="relative h-full w-full pt-12">
        <div v-if="!hydrated" class="flex h-full items-center justify-center">
          <LoadingSpinner />
        </div>
        <slot v-else></slot>
      </div>
```

- [ ] **Step 7: Verify in the browser**

Run: `pnpm dev`, sign in, and open DevTools → Application → IndexedDB.
Expected: a `FooderinoDB` database exists with a `syncState` row carrying a `device_id` and your `user_id`. The spinner appears once on first load and not on subsequent navigations.

- [ ] **Step 8: Commit**

```bash
git add utils/account.ts app/composables/useSyncBootstrap.ts app/layouts/app.vue tests/unit/account-switch.test.ts
git commit -m "feat: bootstrap sync engine with hydration gate and account guard"
```

---

## Task 13: Cut over lists (phase 4a)

**Files:**
- Create: `app/composables/useLists.ts`
- Modify: `app/store/list.ts` (full rewrite)
- Modify: `app/components/lists/ListMenu.vue:34-53` (the `users` loop)
- Test: `tests/unit/lists.test.ts`
- Delete: `server/api/list.ts`

**Interfaces:**
- Consumes: `db`, `notifyLocalChange`, `ListRecord`, `ListMemberRecord`.
- Produces:
  - `~~/utils/list-ops.ts` exports `buildList(name, ownerId)`, `buildMember(listId, user, role)` — pure builders, testable without Nuxt.
  - `useLists()` returning `{ lists, members, loading, create, rename, remove, removeMember }`.
  - `useListStore()` keeps only `selectedList`, `setSelectedList`, and re-exports `lists`/`isLoading` from `useLists`.

**Context:** **This is the point of no return.** After this task, list writes go to Dexie and the v2 tables; the legacy `lists` table is stale. Confirm `supabase/verify-v2.sql` passes before starting.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/lists.test.ts
import { describe, it, expect } from 'vitest';
import { buildList, buildMember } from '~~/utils/list-ops';

describe('buildList', () => {
  it('mints a uuid, stamps updated_at and leaves the tombstone empty', () => {
    const list = buildList('Groceries', 'user-a');
    expect(list.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(list.name).toBe('Groceries');
    expect(list.owner).toBe('user-a');
    expect(list.deleted_at).toBeNull();
    expect(list.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});

describe('buildMember', () => {
  it('makes the creator an admin', () => {
    const m = buildMember('list-1', { id: 'user-a', email: 'a@b.c', name: 'A', avatar: null }, 'admin');
    expect(m.role).toBe('admin');
    expect(m.list_id).toBe('list-1');
    expect(m.user_id).toBe('user-a');
    expect(m.email).toBe('a@b.c');
  });

  it('defaults an invited person to member', () => {
    const m = buildMember('list-1', { id: 'user-b', email: 'b@b.c', name: 'B', avatar: null }, 'member');
    expect(m.role).toBe('member');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/lists.test.ts`
Expected: FAIL — cannot resolve `~~/utils/list-ops`.

- [ ] **Step 3: Write the builders**

```ts
// utils/list-ops.ts
import type { ListRecord, ListMemberRecord } from '~~/types/sync';

export interface MemberIdentity {
  id: string | null;
  email: string;
  name: string | null;
  avatar: string | null;
}

export function buildList(name: string, ownerId: string): ListRecord {
  return {
    id: crypto.randomUUID(),
    name,
    owner: ownerId,
    updated_at: new Date().toISOString(),
    deleted_at: null
  };
}

export function buildMember(
  listId: string,
  who: MemberIdentity,
  role: 'admin' | 'member'
): ListMemberRecord {
  return {
    id: crypto.randomUUID(),
    list_id: listId,
    user_id: who.id,
    email: who.email,
    name: who.name,
    avatar: who.avatar,
    role,
    updated_at: new Date().toISOString(),
    deleted_at: null
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/lists.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the repository composable**

The module-level singleton means one live subscription shared by every component, so data is already populated when a page mounts. Per-mount refs made each navigation flash an empty state before the async `liveQuery` fired.

```ts
// app/composables/useLists.ts
import { liveQuery } from 'dexie';
import { db } from '~~/utils/db';
import { notifyLocalChange } from '~~/utils/sync-hook';
import { buildList, buildMember, type MemberIdentity } from '~~/utils/list-ops';
import type { ListRecord, ListMemberRecord } from '~~/types/sync';

const lists = ref<ListRecord[]>([]);
const members = ref<ListMemberRecord[]>([]);
const loading = ref(true);
let started = false;

function ensureStarted(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  liveQuery(() => db.lists.filter((l) => l.deleted_at === null).toArray()).subscribe({
    next: (rows) => {
      lists.value = rows.sort((a, b) => a.name.localeCompare(b.name));
      loading.value = false;
    },
    error: (e) => {
      loading.value = false;
      console.error('useLists:', e);
    }
  });

  liveQuery(() => db.list_members.filter((m) => m.deleted_at === null).toArray()).subscribe({
    next: (rows) => { members.value = rows; },
    error: (e) => console.error('useLists members:', e)
  });
}

export function useLists() {
  onBeforeMount(ensureStarted);

  async function create(name: string, owner: MemberIdentity): Promise<string> {
    if (!owner.id) throw new Error('Cannot create a list without a signed-in user');
    const list = buildList(name, owner.id);
    const member = buildMember(list.id, owner, 'admin');

    await db.transaction('rw', db.lists, db.list_members, async () => {
      await db.lists.add(list);
      await db.list_members.add(member);
    });

    notifyLocalChange('lists', list.id);
    notifyLocalChange('list_members', member.id);
    return list.id;
  }

  async function rename(id: string, name: string): Promise<void> {
    await db.lists.update(id, { name, updated_at: new Date().toISOString() });
    notifyLocalChange('lists', id);
  }

  /** Soft delete, so the removal reaches other devices. */
  async function remove(id: string): Promise<void> {
    const now = new Date().toISOString();
    await db.lists.update(id, { deleted_at: now, updated_at: now });
    notifyLocalChange('lists', id);
  }

  async function removeMember(listId: string, email: string): Promise<void> {
    const now = new Date().toISOString();
    const row = members.value.find((m) => m.list_id === listId && m.email === email);
    if (!row) return;
    await db.list_members.update(row.id, { deleted_at: now, updated_at: now });
    notifyLocalChange('list_members', row.id);
  }

  function membersOf(listId: string) {
    return computed(() => members.value.filter((m) => m.list_id === listId));
  }

  return { lists, members, loading, create, rename, remove, removeMember, membersOf };
}
```

- [ ] **Step 6: Rewrite the list store as UI state only**

```ts
// app/store/list.ts
import type { ListRecord } from '~~/types/sync';

interface State {
  selectedListId: string | null;
}

export const useListStore = defineStore('list', () => {
  const state = reactive<State>({ selectedListId: null });
  const { lists, loading, create, rename, remove, removeMember, membersOf } = useLists();

  const selectedList = computed<ListRecord | null>(
    () => lists.value.find((l) => l.id === state.selectedListId) ?? lists.value[0] ?? null
  );

  const setSelectedList = (list: ListRecord | null) => {
    state.selectedListId = list?.id ?? null;
  };

  const selectedMembers = computed(() =>
    selectedList.value ? membersOf(selectedList.value.id).value : []
  );

  return {
    ...toRefs(state),
    lists,
    isLoading: loading,
    selectedList,
    selectedMembers,
    setSelectedList,
    createList: create,
    renameList: rename,
    deleteList: remove,
    removeUser: removeMember
  };
});
```

- [ ] **Step 7: Update callers of the removed store methods**

`createList` now takes an identity object rather than reading `useSupabaseUser()` itself. In `app/components/lists/NewList.vue`, change the create call to:

```ts
const user = useSupabaseUser();
await listStore.createList(name.value, {
  id: user.value?.id ?? null,
  email: user.value?.email ?? '',
  name: user.value?.user_metadata?.full_name ?? null,
  avatar: user.value?.user_metadata?.picture ?? null
});
```

`renameList` and `deleteList` now require the list id. In `app/components/lists/ListMenu.vue` and any rename/delete drawer, pass `listStore.selectedList.id` as the first argument.

- [ ] **Step 8: Rewire the member avatars in `ListMenu.vue`**

Replace the `v-for="user of selectedList?.users"` loop (currently at lines 40-49) with the normalized members, and drop the invite block above it:

```vue
      <div class="flex flex-row items-center gap-1 px-2 pt-2">
        <UserList
          class="size-8"
          v-for="member of listStore.selectedMembers"
          :avatar="member.avatar"
          :name="member.name"
          :email="member.email"
          :admin="member.role === 'admin'"
          :key="member.email"
          @remove-user="onRemoveUser(selectedList.id, $event)">
        </UserList>
      </div>
```

Update `onRemoveUser` in the same file:

```ts
const onRemoveUser = async (listId: string, email: string) => {
  await listStore.removeUser(listId, email);
  toast('Successfully removed user', { description: email });
};
```

- [ ] **Step 9: Delete the now-unused endpoint**

```bash
git rm server/api/list.ts
```

- [ ] **Step 10: Verify in the browser**

Run: `pnpm dev`. Then:
1. Existing lists appear (pulled from `lists_v2`).
2. Create a list — it appears instantly, with no network wait.
3. Reload — it is still there.
4. Check Supabase: the row exists in `lists_v2` with a matching `list_members` row.
5. Go offline in DevTools, rename a list, come back online. The rename reaches Supabase.

- [ ] **Step 11: Commit**

The deletion of `server/api/list.ts` was already staged by `git rm` in Step 9.

```bash
git add utils/list-ops.ts app/composables/useLists.ts app/store/list.ts app/components/lists/ tests/unit/lists.test.ts
git commit -m "feat!: read and write lists from Dexie"
```

---

## Task 14: Cut over items (phase 4b)

**Files:**
- Create: `app/composables/useItems.ts`
- Modify: `app/store/item.ts` (full rewrite)
- Modify: `app/store/actions.ts:88-101` (`confirmPurchasing`)
- Test: `tests/unit/items.test.ts`

**Interfaces:**
- Consumes: `db`, `notifyLocalChange`, `makeOp`, `ItemRecord`, `PendingOp`.
- Produces: `useItems()` returning `{ items, loading, inventoryItems, buyItems, create, update, remove, addDelta, setAmount }` where:
  - `addDelta(item: ItemRecord, field: OpField, delta: number): Promise<void>`
  - `setAmount(item: ItemRecord, field: OpField, value: number): Promise<void>`
  - `create(input): Promise<string>` and `update(id, patch): Promise<void>` — neither touches the counter fields.

**Context:** The one rule that matters here: **`create` and `update` must never write `amount` or `amount_to_purchase` directly.** Those two columns are owned by the op path. Writing them locally would diverge from the server, which only ever sees ops.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/items.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '~~/utils/db';
import { queueDelta, queueSet, buildItem } from '~~/utils/item-ops';

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
});

const seed = async (over = {}) => {
  const item = { ...buildItem({ list_id: 'l', name: 'milk', location: 'fridge', store: 'aldi', amount_type: 'count', default_amount: 1, created_by: 'a@b.c' }), ...over };
  await db.items.add(item);
  return item;
};

describe('buildItem', () => {
  it('starts both counters at zero, because ops carry the opening values', () => {
    const item = buildItem({ list_id: 'l', name: 'milk', location: '', store: '', amount_type: 'count', default_amount: 1, created_by: null });
    expect(item.amount).toBe(0);
    expect(item.amount_to_purchase).toBe(0);
  });
});

describe('queueDelta', () => {
  it('updates the local value immediately so the UI never lags', async () => {
    const item = await seed({ amount: 2 });
    await queueDelta(item, 'amount', 1, 'a@b.c');
    expect((await db.items.get(item.id))?.amount).toBe(3);
  });

  it('queues exactly one op per call', async () => {
    const item = await seed();
    await queueDelta(item, 'amount', 1, 'a@b.c');
    await queueDelta(item, 'amount', 1, 'a@b.c');

    const ops = await db.pendingOps.toArray();
    expect(ops).toHaveLength(2);
    expect(ops.every((o) => o.kind === 'delta' && o.value === 1)).toBe(true);
  });

  it('does not bump updated_at, which belongs to the LWW fields', async () => {
    const item = await seed({ updated_at: '2026-01-01T00:00:00.000Z' });
    await queueDelta(item, 'amount', 1, 'a@b.c');
    expect((await db.items.get(item.id))?.updated_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('handles the two counters independently', async () => {
    const item = await seed({ amount: 1, amount_to_purchase: 1 });
    await queueDelta(item, 'amount_to_purchase', 4, 'a@b.c');
    const after = await db.items.get(item.id);
    expect(after?.amount).toBe(1);
    expect(after?.amount_to_purchase).toBe(5);
  });

  it('allows a negative delta for undo', async () => {
    const item = await seed({ amount: 3 });
    await queueDelta(item, 'amount', -1, 'a@b.c');
    expect((await db.items.get(item.id))?.amount).toBe(2);
  });
});

describe('queueSet', () => {
  it('replaces the local value and queues a set op', async () => {
    const item = await seed({ amount: 3 });
    await queueSet(item, 'amount', 10, 'a@b.c');

    expect((await db.items.get(item.id))?.amount).toBe(10);
    const ops = await db.pendingOps.toArray();
    expect(ops[0].kind).toBe('set');
    expect(ops[0].value).toBe(10);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/items.test.ts`
Expected: FAIL — cannot resolve `~~/utils/item-ops`.

- [ ] **Step 3: Write the item op helpers**

```ts
// utils/item-ops.ts
import { db } from '~~/utils/db';
import { makeOp } from '~~/utils/ops';
import { notifyLocalChange } from '~~/utils/sync-hook';
import type { ItemRecord, OpField } from '~~/types/sync';

export function buildItem(input: {
  list_id: string;
  name: string;
  location: string;
  store: string;
  amount_type: string;
  default_amount: number;
  created_by: string | null;
}): ItemRecord {
  return {
    id: crypto.randomUUID(),
    ...input,
    // Both counters open at zero. The caller queues `set` ops for the real
    // opening values, so the server's trigger stays the sole writer of these.
    amount: 0,
    amount_to_purchase: 0,
    updated_at: new Date().toISOString(),
    deleted_at: null
  };
}

async function queue(
  item: ItemRecord,
  field: OpField,
  kind: 'delta' | 'set',
  value: number,
  actor: string | null
): Promise<void> {
  const next = kind === 'delta' ? item[field] + value : value;
  const op = makeOp({ item_id: item.id, list_id: item.list_id, field, kind, value, actor });

  await db.transaction('rw', db.items, db.pendingOps, async () => {
    // Only the counter changes. `updated_at` deliberately stays put: it is
    // the LWW cursor for the *other* fields, and bumping it here would make
    // a pure counter change masquerade as an edit to name/store/location.
    await db.items.update(item.id, { [field]: next });
    await db.pendingOps.add(op);
  });

  notifyLocalChange('items', item.id);
}

export function queueDelta(item: ItemRecord, field: OpField, delta: number, actor: string | null) {
  return queue(item, field, 'delta', delta, actor);
}

export function queueSet(item: ItemRecord, field: OpField, value: number, actor: string | null) {
  return queue(item, field, 'set', value, actor);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/items.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the repository composable**

```ts
// app/composables/useItems.ts
import { liveQuery } from 'dexie';
import { db } from '~~/utils/db';
import { notifyLocalChange } from '~~/utils/sync-hook';
import { buildItem, queueDelta, queueSet } from '~~/utils/item-ops';
import type { ItemRecord, OpField } from '~~/types/sync';

const items = ref<ItemRecord[]>([]);
const loading = ref(true);
let started = false;

function ensureStarted(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  liveQuery(() => db.items.filter((i) => i.deleted_at === null).toArray()).subscribe({
    next: (rows) => { items.value = rows; loading.value = false; },
    error: (e) => { loading.value = false; console.error('useItems:', e); }
  });
}

// `listId` is a computed in every caller, so it must accept ComputedRef too —
// ComputedRef is read-only and not assignable to the mutable Ref type.
export function useItems(listId?: Ref<string | null> | ComputedRef<string | null>) {
  onBeforeMount(ensureStarted);
  const user = useSupabaseUser();
  const actor = computed(() => user.value?.email ?? null);

  const scoped = computed(() =>
    listId?.value ? items.value.filter((i) => i.list_id === listId.value) : items.value
  );
  const inventoryItems = computed(() => scoped.value.filter((i) => i.amount > 0));
  const buyItems = computed(() => scoped.value.filter((i) => i.amount_to_purchase > 0));

  async function create(input: {
    list_id: string; name: string; location: string; store: string;
    amount_type: string; default_amount: number;
    amount?: number; amount_to_purchase?: number;
  }): Promise<string> {
    const item = buildItem({
      list_id: input.list_id, name: input.name,
      location: input.location.trim(), store: input.store.trim(),
      amount_type: input.amount_type, default_amount: input.default_amount,
      created_by: actor.value
    });
    await db.items.add(item);
    notifyLocalChange('items', item.id);

    if (input.amount) await queueSet(item, 'amount', input.amount, actor.value);
    if (input.amount_to_purchase) {
      await queueSet({ ...item, amount: input.amount ?? 0 }, 'amount_to_purchase', input.amount_to_purchase, actor.value);
    }
    return item.id;
  }

  /** Non-counter fields only. Counters go through addDelta / setAmount. */
  async function update(
    id: string,
    patch: Partial<Pick<ItemRecord, 'name' | 'location' | 'store' | 'amount_type' | 'default_amount'>>
  ): Promise<void> {
    await db.items.update(id, { ...patch, updated_at: new Date().toISOString() });
    notifyLocalChange('items', id);
  }

  async function remove(id: string): Promise<void> {
    const now = new Date().toISOString();
    await db.items.update(id, { deleted_at: now, updated_at: now });
    notifyLocalChange('items', id);
  }

  const addDelta = (item: ItemRecord, field: OpField, delta: number) =>
    queueDelta(item, field, delta, actor.value);

  const setAmount = (item: ItemRecord, field: OpField, value: number) =>
    queueSet(item, field, value, actor.value);

  return { items: scoped, loading, inventoryItems, buyItems, create, update, remove, addDelta, setAmount };
}
```

- [ ] **Step 6: Rewrite the item store**

Every `fetch*` method and the `debouncedFetchItems` timer are deleted — there is nothing to fetch.

```ts
// app/store/item.ts
import { useListStore } from './list';
import { useSettingsStore } from './settings';
import { useLogStore } from './logs';
import type { ItemRecord } from '~~/types/sync';

interface State {
  selectedItems: string[];
  filterInput: string;
  showBuyItemsFromAllLists: boolean;
}

export const useItemStore = defineStore('item', () => {
  const state = reactive<State>({
    selectedItems: [],
    filterInput: '',
    showBuyItemsFromAllLists: false
  });

  const listStore = useListStore();
  const settingStore = useSettingsStore();
  const logStore = useLogStore();

  const listId = computed(() => listStore.selectedList?.id ?? null);
  const repo = useItems(listId);
  const allRepo = useItems();

  const matchesFilter = (name: string) =>
    name.toLowerCase().includes(state.filterInput.toLowerCase());

  const getFilteredInventoryItems = computed(() => repo.inventoryItems.value.filter((i) => matchesFilter(i.name)));
  const getFilteredShoppingItems = computed(() => repo.buyItems.value.filter((i) => matchesFilter(i.name)));
  const getFilteredAllBuyItems = computed(() => allRepo.buyItems.value.filter((i) => matchesFilter(i.name)));

  const addItemToBuy = async (item: ItemRecord) => {
    await repo.addDelta(item, 'amount_to_purchase', item.amount_type === 'g' ? 100 : 1);
  };

  const addItemToInventory = async (item: ItemRecord) => {
    const moved = item.amount_to_purchase;
    if (!useNoInventoryMode()) {
      await repo.addDelta(item, 'amount', moved);
    }
    await repo.setAmount(item, 'amount_to_purchase', 0);
    await logStore.insertLog(item.name, 'updated', `${item.amount} → ${item.amount + moved}`);
  };

  const insertItem = async (data: any) => {
    if (!listId.value) return;
    const existing = repo.items.value.find((i) => i.name === data.name);
    if (existing) {
      await repo.update(existing.id, {
        location: data.location?.trim() ?? existing.location,
        store: data.store?.trim() ?? existing.store,
        amount_type: data.amountType ?? existing.amount_type,
        default_amount: data.defaultAmount ?? existing.default_amount
      });
      const wanted = data.amountToPurchase ?? data.amount_to_purchase ?? 0;
      if (wanted) await repo.setAmount(existing, 'amount_to_purchase', wanted);
      return;
    }

    await repo.create({
      list_id: listId.value,
      name: data.name,
      location: data.location ?? '',
      store: data.store ?? '',
      amount_type: data.amountType ?? 'count',
      default_amount: data.defaultAmount ?? 1,
      amount: data.amount ?? 0,
      amount_to_purchase: data.amountToPurchase ?? data.amount_to_purchase ?? 0
    });
    await logStore.insertLog(data.name, 'created', '');
  };

  const updateItem = async (data: any) => {
    const item = repo.items.value.find((i) => i.id === data.id);
    if (!item) return;

    await repo.update(item.id, {
      name: data.name,
      location: data.location?.trim() ?? '',
      store: data.store?.trim() ?? '',
      default_amount: data.default_amount,
      amount_type: data.amount_type
    });

    if (data.amount !== undefined && data.amount !== item.amount) {
      await repo.setAmount(item, 'amount', data.amount);
      await logStore.insertLog(data.name, 'updated', `${item.amount} → ${data.amount}`);
    }
    if (data.amount_to_purchase !== undefined && data.amount_to_purchase !== item.amount_to_purchase) {
      await repo.setAmount(item, 'amount_to_purchase', data.amount_to_purchase);
    }
  };

  const deleteItem = async (id: string) => {
    const item = repo.items.value.find((i) => i.id === id);
    await repo.remove(id);
    if (item) await logStore.insertLog(item.name, 'deleted', '');
  };

  const renameCategory = async (oldCategory: string, newCategory: string) => {
    for (const item of repo.items.value.filter((i) => i.location === oldCategory)) {
      await repo.update(item.id, { location: newCategory });
    }
  };

  const renameStore = async (oldStore: string, newStore: string) => {
    for (const item of repo.items.value.filter((i) => i.store === oldStore)) {
      await repo.update(item.id, { store: newStore });
    }
  };

  const selectItem = (id: string) => {
    const i = state.selectedItems.indexOf(id);
    if (i > -1) state.selectedItems.splice(i, 1);
    else state.selectedItems.push(id);
  };
  const deselectAllItems = () => { state.selectedItems = []; };
  const isItemSelected = (id: string) => state.selectedItems.includes(id);
  const setFilterInput = (input: string) => { state.filterInput = input; };

  const uniqueSorted = (values: string[]) =>
    [...new Set(values.map((v) => v.trim()))].sort((a, b) => a.localeCompare(b));

  const inventoryCategories = computed(() =>
    uniqueSorted(
      getFilteredInventoryItems.value
        .filter((i) => (settingStore.settings?.show_empty_items ? true : i.amount > 0))
        .map((i) => i.location)
    )
  );
  const allCategories = computed(() => uniqueSorted(repo.items.value.map((i) => i.location)));
  const buyCategories = computed(() => uniqueSorted(getFilteredShoppingItems.value.map((i) => i.store)));
  const allItemNames = computed(() => repo.items.value.map((i) => i.name));

  return {
    ...toRefs(state),
    inventoryItems: repo.inventoryItems,
    buyItems: repo.buyItems,
    allItems: repo.items,
    buyItemsFromAllLists: allRepo.buyItems,
    addItemToInventory, addItemToBuy, insertItem, updateItem, deleteItem,
    selectItem, deselectAllItems, setFilterInput, renameCategory, renameStore,
    isItemSelected, getFilteredInventoryItems, getFilteredShoppingItems,
    getFilteredAllBuyItems, inventoryCategories, buyCategories, allCategories, allItemNames
  };
});
```

- [ ] **Step 7: Simplify `confirmPurchasing`**

In `app/store/actions.ts`, replace `confirmPurchasing` (currently lines 88-101). The `forEach(async …)` there does not await, so it races; a sequential loop is both simpler and correct.

```ts
  const confirmPurchasing = async () => {
    const itemStore = useItemStore();
    for (const item of [...state.purchasedItems]) {
      await itemStore.addItemToInventory(item);
      removePurchasedItemById(item.id);
    }
    state.actions = [];
    state.currentActionIndex = -1;
  };
```

- [ ] **Step 8: Remove dead callers**

Search for calls to the deleted fetch methods and delete each one — they have no replacement, because `liveQuery` keeps the data current:

```bash
grep -rn "fetchItems\|fetchBuyItems\|fetchInventoryItems\|debouncedFetchItems" app/
```

Expected after cleanup: no matches.

- [ ] **Step 9: Verify the concurrent-increment property in the browser**

Run: `pnpm dev`. Open the same list in two browser profiles signed in as two members of it.
1. In profile A, go offline in DevTools. Tap `+1` on an item three times.
2. In profile B, tap `+1` on the same item twice. Its counter reads `+2`.
3. Bring A back online.
4. **Expected: both profiles converge on `+5`.** If either shows `+3` or `+2`, the counter path is falling back to LWW — check that `pushOmit` is stripping the columns in Task 9.

- [ ] **Step 10: Run the full suite and commit**

```bash
pnpm test
git add utils/item-ops.ts app/composables/useItems.ts app/store/item.ts app/store/actions.ts tests/unit/items.test.ts
git commit -m "feat!: read and write items from Dexie with counter ops"
```

---

## Task 15: Cut over logs

**Files:**
- Create: `app/composables/useLogs.ts`
- Modify: `app/store/logs.ts` (full rewrite)
- Test: `tests/unit/logs.test.ts`

**Interfaces:**
- Consumes: `db`, `notifyLocalChange`, `LogRecord`.
- Produces:
  - `~~/utils/log-ops.ts` exports `buildLog(listId, actorEmail, itemName, action, payload): LogRecord` and `pruneLogs(listId, keep): Promise<number>` (returns the number deleted).
  - `useLogs(listId)` returning `{ logs, append }`.
  - `useLogStore()` keeps `insertLog(itemName, action, payload)` — note the signature drops `list_id` and `user`, which it now reads from context.

**Context:** Logs are append-only: no `updated_at`, no `deleted_at`, never merged. They are also the one table that grows without bound, so pruning keeps only the newest entries locally while the server retains full history.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/logs.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '~~/utils/db';
import { buildLog, pruneLogs, LOCAL_LOG_LIMIT } from '~~/utils/log-ops';

beforeEach(async () => {
  await db.open();
  await db.logs.clear();
});

describe('buildLog', () => {
  it('stamps a uuid and created_at, and carries no tombstone fields', () => {
    const log = buildLog('list-1', 'a@b.c', 'milk', 'created', '');
    expect(log.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(log.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(log).not.toHaveProperty('deleted_at');
    expect(log).not.toHaveProperty('updated_at');
  });
});

describe('pruneLogs', () => {
  const seed = async (listId: string, count: number) => {
    await db.logs.bulkAdd(
      Array.from({ length: count }, (_, i) => ({
        id: `${listId}-${String(i).padStart(4, '0')}`,
        list_id: listId,
        actor_email: 'a@b.c',
        item_name: 'milk',
        action: 'updated',
        payload: '',
        created_at: `2026-01-01T00:00:00.${String(i).padStart(3, '0')}Z`
      }))
    );
  };

  it('keeps nothing back when under the limit', async () => {
    await seed('l1', 5);
    expect(await pruneLogs('l1', LOCAL_LOG_LIMIT)).toBe(0);
    expect(await db.logs.count()).toBe(5);
  });

  it('trims to the limit, keeping the newest', async () => {
    await seed('l1', LOCAL_LOG_LIMIT + 10);
    const deleted = await pruneLogs('l1', LOCAL_LOG_LIMIT);

    expect(deleted).toBe(10);
    expect(await db.logs.count()).toBe(LOCAL_LOG_LIMIT);

    const remaining = await db.logs.orderBy('created_at').toArray();
    expect(remaining[remaining.length - 1].id).toBe(`l1-${String(LOCAL_LOG_LIMIT + 9).padStart(4, '0')}`);
  });

  it('only prunes the list it was asked about', async () => {
    await seed('l1', LOCAL_LOG_LIMIT + 5);
    await seed('l2', 3);

    await pruneLogs('l1', LOCAL_LOG_LIMIT);

    expect(await db.logs.where('list_id').equals('l2').count()).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/logs.test.ts`
Expected: FAIL — cannot resolve `~~/utils/log-ops`.

- [ ] **Step 3: Write the implementation**

```ts
// utils/log-ops.ts
import { db } from '~~/utils/db';
import type { LogRecord } from '~~/types/sync';

/** Local retention. The server keeps full history; this bounds IndexedDB. */
export const LOCAL_LOG_LIMIT = 200;

export function buildLog(
  listId: string,
  actorEmail: string | null,
  itemName: string | null,
  action: string,
  payload: string
): LogRecord {
  return {
    id: crypto.randomUUID(),
    list_id: listId,
    actor_email: actorEmail,
    item_name: itemName,
    action,
    payload,
    created_at: new Date().toISOString()
  };
}

/** Drops all but the newest `keep` entries for one list. Returns how many went. */
export async function pruneLogs(listId: string, keep: number): Promise<number> {
  const ids = await db.logs.where('list_id').equals(listId).sortBy('created_at');
  if (ids.length <= keep) return 0;

  const stale = ids.slice(0, ids.length - keep).map((l) => l.id);
  await db.logs.bulkDelete(stale);
  return stale.length;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/logs.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the composable and rewrite the store**

```ts
// app/composables/useLogs.ts
import { liveQuery } from 'dexie';
import { db } from '~~/utils/db';
import { notifyLocalChange } from '~~/utils/sync-hook';
import { buildLog, pruneLogs, LOCAL_LOG_LIMIT } from '~~/utils/log-ops';
import type { LogRecord } from '~~/types/sync';

const all = ref<LogRecord[]>([]);
let started = false;

function ensureStarted(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  liveQuery(() => db.logs.toArray()).subscribe({
    next: (rows) => { all.value = rows; },
    error: (e) => console.error('useLogs:', e)
  });
}

export function useLogs(listId?: Ref<string | null> | ComputedRef<string | null>) {
  onBeforeMount(ensureStarted);

  const logs = computed(() =>
    all.value
      .filter((l) => (listId?.value ? l.list_id === listId.value : true))
      .filter((l) => l.payload !== '')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  );

  async function append(
    list_id: string, actor: string | null, itemName: string | null,
    action: string, payload: string
  ): Promise<void> {
    const log = buildLog(list_id, actor, itemName, action, payload);
    await db.logs.add(log);
    notifyLocalChange('logs', log.id);
    await pruneLogs(list_id, LOCAL_LOG_LIMIT);
  }

  return { logs, append };
}
```

```ts
// app/store/logs.ts
import { useListStore } from './list';

export const useLogStore = defineStore('logs', () => {
  const listStore = useListStore();
  const user = useSupabaseUser();
  const listId = computed(() => listStore.selectedList?.id ?? null);
  const { logs, append } = useLogs(listId);

  /**
   * The list id and actor come from context now, so callers pass only what
   * they know about the change itself.
   */
  const insertLog = async (itemName: string, action: string, payload: string) => {
    if (!listId.value) return;
    await append(listId.value, user.value?.email ?? null, itemName, action, payload);
  };

  return { logs, insertLog };
});
```

- [ ] **Step 6: Update the log call sites**

`insertLog` lost its first two arguments. In `app/store/item.ts` the calls were already rewritten in Task 14. Confirm no stale five-argument calls remain:

```bash
grep -rn "insertLog(" app/
```

Expected: every call passes exactly three arguments.

- [ ] **Step 7: Verify and commit**

Run: `pnpm dev`, change an item amount, open `/logs`.
Expected: the entry appears immediately; it also appears in Supabase's `logs_v2`.

```bash
pnpm test
git add utils/log-ops.ts app/composables/useLogs.ts app/store/logs.ts tests/unit/logs.test.ts
git commit -m "feat!: read and write logs from Dexie with local pruning"
```

---

## Task 16: Cut over recipes

**Files:**
- Create: `app/composables/useRecipes.ts`
- Modify: `app/store/recipes.ts` (full rewrite)
- Modify: `server/api/recipe.ts:36-44` (the inventory lookup)

**Interfaces:**
- Consumes: `db`, `notifyLocalChange`, `RecipeRecord`; **`settingStore.fetchQuota()` from Task 17**.
- Produces: `useRecipes()` returning `{ recipes, savedRecipes, generatedRecipes, add, update, remove, byId }`.

> **Run Task 17 before this task.** The rewritten recipe store calls
> `settingStore.fetchQuota()`, which replaces `fetchSettings()` and does not exist
> until Task 17 lands.

**Context:** Recipes are per-user, not per-list, so they use a plain `user_id = auth.uid()` policy. Generation stays server-side: `/api/recipe` holds the OpenAI key and enforces the quota. Its inventory lookup moves from the legacy `items` table to `items_v2`.

- [ ] **Step 1: Write the composable**

```ts
// app/composables/useRecipes.ts
import { liveQuery } from 'dexie';
import { db } from '~~/utils/db';
import { notifyLocalChange } from '~~/utils/sync-hook';
import type { RecipeRecord, RecipeIngredient } from '~~/types/sync';

const recipes = ref<RecipeRecord[]>([]);
const loading = ref(true);
let started = false;

function ensureStarted(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  liveQuery(() => db.recipes.filter((r) => r.deleted_at === null).toArray()).subscribe({
    next: (rows) => {
      recipes.value = rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      loading.value = false;
    },
    error: (e) => { loading.value = false; console.error('useRecipes:', e); }
  });
}

export function useRecipes() {
  onBeforeMount(ensureStarted);
  const user = useSupabaseUser();

  async function add(input: {
    name: string; description: string | null;
    ingredients: RecipeIngredient[]; instructions: string | null; saved?: boolean;
  }): Promise<string> {
    const userId = user.value?.id;
    if (!userId) throw new Error('Cannot save a recipe without a signed-in user');

    const recipe: RecipeRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: input.name,
      description: input.description,
      ingredients: input.ingredients,
      instructions: input.instructions,
      saved: input.saved ?? false,
      updated_at: new Date().toISOString(),
      deleted_at: null
    };
    await db.recipes.add(recipe);
    notifyLocalChange('recipes', recipe.id);
    return recipe.id;
  }

  async function update(id: string, patch: Partial<RecipeRecord>): Promise<void> {
    await db.recipes.update(id, { ...patch, updated_at: new Date().toISOString() });
    notifyLocalChange('recipes', id);
  }

  async function remove(id: string): Promise<void> {
    const now = new Date().toISOString();
    await db.recipes.update(id, { deleted_at: now, updated_at: now });
    notifyLocalChange('recipes', id);
  }

  const savedRecipes = computed(() => recipes.value.filter((r) => r.saved));
  const generatedRecipes = computed(() => recipes.value.filter((r) => !r.saved));
  const byId = (id: string) => computed(() => recipes.value.find((r) => r.id === id) ?? null);

  return { recipes, loading, savedRecipes, generatedRecipes, add, update, remove, byId };
}
```

- [ ] **Step 2: Rewrite the recipe store**

```ts
// app/store/recipes.ts
import { toast } from 'vue-sonner';
import { useItemStore } from './item';
import { useListStore } from './list';
import { useSettingsStore } from './settings';

export const useRecipeStore = defineStore('recipes', () => {
  const itemStore = useItemStore();
  const listStore = useListStore();
  const settingStore = useSettingsStore();
  const repo = useRecipes();
  const generating = ref(false);

  const generateRecipe = async (useHasIngredients: boolean, request: string) => {
    generating.value = true;
    try {
      const generated = await $fetch('/api/recipe', {
        query: { useHasIngredients, request, listId: listStore.selectedList?.id }
      });
      await repo.add({
        name: generated.name,
        description: generated.description ?? null,
        ingredients: generated.ingredients ?? [],
        instructions: generated.instructions ?? null,
        saved: false
      });
      await settingStore.fetchQuota();
    } catch (e: any) {
      toast(e?.data?.message || 'Failed to generate recipe');
    } finally {
      generating.value = false;
    }
  };

  const hasIngredients = (ingredient: string) => {
    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return itemStore.inventoryItems.some(
      (item) => normalize(item.name).includes(normalize(ingredient)) && item.amount > 0
    );
  };

  return {
    recipes: repo.recipes,
    generating,
    savedRecipes: repo.savedRecipes,
    generatedRecipes: repo.generatedRecipes,
    generateRecipe,
    insertRecipe: repo.add,
    updateRecipe: repo.update,
    deleteRecipe: repo.remove,
    recipeById: repo.byId,
    hasIngredients
  };
});
```

- [ ] **Step 3: Point the server's inventory lookup at `items_v2`**

In `server/api/recipe.ts`, replace the inventory query (currently around line 41):

```ts
    const inventoryItems = await client
      .from('items_v2')
      .select('name')
      .gte('amount', 1)
      .is('deleted_at', null)
      .eq('list_id', listId);
```

And replace the known-recipes query (around line 33):

```ts
  const recipes = await client.from('recipes_v2').select('name').eq('user_id', user.id);
```

- [ ] **Step 4: Update route params**

`app/pages/recipe/[id].vue` currently looks a recipe up by numeric `index`. Change it to use the UUID:

```ts
const route = useRoute();
const { byId } = useRecipes();
const recipe = byId(route.params.id as string);
```

Update any `<NuxtLink :to="`/recipe/${recipe.index}`">` in `RecipeCard.vue` / `RecipeList.vue` to `recipe.id`.

- [ ] **Step 5: Verify and commit**

Run: `pnpm dev`, generate a recipe, save it, reload.
Expected: it persists, appears in `recipes_v2`, and the quota decrements by one.

```bash
pnpm test
git add app/composables/useRecipes.ts app/store/recipes.ts server/api/recipe.ts app/pages/recipe/ app/components/recipes/
git commit -m "feat!: read and write recipes from Dexie"
```

---

## Task 17: Split settings from the server-owned quota

**Files:**
- Create: `app/composables/useUserSettings.ts`
- Modify: `app/store/settings.ts` (full rewrite)
- Modify: `server/api/settings.ts`
- Modify: `app/composables/features.ts`

**Interfaces:**
- Consumes: `db`, `notifyLocalChange`, `UserSettingsRecord`.
- Produces:
  - `useUserSettings()` returning `{ settings, update }` where `settings: ComputedRef<UserSettingsRecord | null>`.
  - `useSettingsStore()` exposing `settings`, `quota`, `fetchQuota`, `updateSettings`, `toggleEmptyItems`, `toggleNoInventoryMode`, `freeAICalls`.

**Context:** `users.ai` and `users.free_ai_calls` are a server-enforced quota. If they lived in a client-writable store, a user could grant themselves unlimited generations by editing IndexedDB. They stay on the server and are cached read-only; everything else in `user_settings` syncs normally.

- [ ] **Step 1: Write the composable**

```ts
// app/composables/useUserSettings.ts
import { liveQuery } from 'dexie';
import { db } from '~~/utils/db';
import { notifyLocalChange } from '~~/utils/sync-hook';
import type { UserSettingsRecord } from '~~/types/sync';

const rows = ref<UserSettingsRecord[]>([]);
let started = false;

function ensureStarted(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  liveQuery(() => db.user_settings.filter((s) => s.deleted_at === null).toArray()).subscribe({
    next: (r) => { rows.value = r; },
    error: (e) => console.error('useUserSettings:', e)
  });
}

export function useUserSettings() {
  onBeforeMount(ensureStarted);
  const user = useSupabaseUser();

  const settings = computed<UserSettingsRecord | null>(
    () => rows.value.find((s) => s.user_id === user.value?.id) ?? null
  );

  /** Creates the row on first write, so a new account needs no seeding. */
  async function update(patch: Partial<UserSettingsRecord>): Promise<void> {
    const userId = user.value?.id;
    if (!userId) return;
    const now = new Date().toISOString();
    const existing = settings.value;

    if (existing) {
      await db.user_settings.update(existing.id, { ...patch, updated_at: now });
      notifyLocalChange('user_settings', existing.id);
      return;
    }

    const fresh: UserSettingsRecord = {
      id: crypto.randomUUID(), user_id: userId,
      servings: 1, allergies: '', cuisines: '',
      show_empty_items: true, no_inventory: false,
      updated_at: now, deleted_at: null,
      ...patch
    };
    await db.user_settings.add(fresh);
    notifyLocalChange('user_settings', fresh.id);
  }

  return { settings, update };
}
```

- [ ] **Step 2: Trim the settings endpoint to the quota only**

```ts
// server/api/settings.ts
import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server';

/**
 * Returns only the server-owned quota. Everything else lives in
 * `user_settings` and syncs to the client like any other record.
 */
export default defineEventHandler(async (event: any) => {
  const user = await serverSupabaseUser(event);
  const client = await serverSupabaseClient(event);

  if (!user) return { quota: null };

  const { data } = await client.from('users').select('ai, free_ai_calls').eq('id', user.id);
  return { quota: data?.[0] ?? null };
});
```

- [ ] **Step 3: Rewrite the settings store**

```ts
// app/store/settings.ts
import type { UserSettingsRecord } from '~~/types/sync';

export const useSettingsStore = defineStore('settings', () => {
  const { settings, update } = useUserSettings();
  const quota = ref<{ ai: boolean; free_ai_calls: number } | null>(null);

  /** Read-only cache. The client never writes these — /api/recipe does. */
  const fetchQuota = async () => {
    const data = await $fetch('/api/settings');
    quota.value = data?.quota ?? null;
    return quota.value;
  };

  const updateSettings = (patch: Partial<UserSettingsRecord>) => update(patch);

  const toggleEmptyItems = () =>
    update({ show_empty_items: !(settings.value?.show_empty_items ?? true) });

  const toggleNoInventoryMode = (value?: boolean) =>
    update({ no_inventory: value ?? !(settings.value?.no_inventory ?? false) });

  const freeAICalls = computed(() => (quota.value?.ai ? 999 : (quota.value?.free_ai_calls ?? 0)));

  return { settings, quota, fetchQuota, updateSettings, toggleEmptyItems, toggleNoInventoryMode, freeAICalls };
});
```

- [ ] **Step 4: Update the feature flag helper**

`features.ts` currently builds a `computed` and immediately unwraps it, which loses reactivity. Return the ref instead:

```ts
// app/composables/features.ts
import { useSettingsStore } from '~/store/settings';

export const useNoInventoryMode = (): boolean =>
  useSettingsStore().settings?.no_inventory ?? false;
```

- [ ] **Step 5: Fetch the quota at boot**

In `app/pages/settings.vue` and `app/pages/recipe/ai.vue`, replace any `settingStore.fetchSettings()` call with:

```ts
onMounted(() => settingStore.fetchQuota());
```

Then confirm nothing still calls the removed method:

```bash
grep -rn "fetchSettings" app/
```

Expected: no matches.

- [ ] **Step 6: Verify the quota cannot be raised locally**

Run: `pnpm dev`, open DevTools → Application → IndexedDB → `FooderinoDB` → `user_settings`, and try editing a record to add `free_ai_calls: 999`.
Expected: the AI generation limit is unchanged, because `/api/recipe` reads the `users` table, not this record.

- [ ] **Step 7: Commit**

```bash
pnpm test
git add app/composables/useUserSettings.ts app/composables/features.ts app/store/settings.ts server/api/settings.ts app/pages/
git commit -m "feat!: sync user settings locally, keep AI quota server-owned"
```

---

## Task 18: Mint and display share tokens

**Files:**
- Create: `server/api/list/share.post.ts`
- Create: `app/components/lists/ShareListModal.vue`
- Modify: `app/components/lists/ListMenu.vue`
- Modify: `app/store/drawers.ts`

**Interfaces:**
- Consumes: `list_share_tokens` from Task 2; `is_list_member()` RLS.
- Produces:
  - `POST /api/list/share` with body `{ listId: string }` → `{ token: string; url: string; expiresAt: string }`.
  - `ShareListModal.vue` with props `{ open: boolean; listId: string | null }` and emit `update:open`.
  Task 19 redeems the token this mints.

**Context:** The QR encodes a **URL**, not a bare token, so the other person can scan it with their phone's stock camera app and land in the browser. Tokens are multi-use within a 24-hour window — a single-use token would break the common case of sharing one list with two housemates.

- [ ] **Step 1: Install the QR libraries**

```bash
pnpm add qrcode jsqr
pnpm add -D @types/qrcode
```

- [ ] **Step 2: Write the share endpoint**

```ts
// server/api/list/share.post.ts
import { randomBytes } from 'node:crypto';
import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server';

const TOKEN_TTL_HOURS = 24;

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: 'Sign in to share a list' });

  const { listId } = await readBody<{ listId?: string }>(event);
  if (!listId) throw createError({ statusCode: 400, message: 'Missing listId' });

  // Uses the caller's own client, so RLS enforces membership: a non-member's
  // insert is rejected by the policy rather than by a check we wrote here.
  const client = await serverSupabaseClient(event);

  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600_000).toISOString();

  const { error } = await client.from('list_share_tokens').insert({
    token,
    list_id: listId,
    created_by: user.id,
    expires_at: expiresAt
  });
  if (error) throw createError({ statusCode: 403, message: 'You cannot share this list' });

  const base = useRuntimeConfig().public.baseUrl;
  return { token, url: `${base}/join?t=${token}`, expiresAt };
});
```

- [ ] **Step 3: Write the share modal**

```vue
<!-- app/components/lists/ShareListModal.vue -->
<script setup lang="ts">
import QRCode from 'qrcode';
import { toast } from 'vue-sonner';

const props = defineProps<{ open: boolean; listId: string | null }>();
const emit = defineEmits<{ 'update:open': [boolean] }>();

const qrDataUrl = ref('');
const shareUrl = ref('');
const expiresAt = ref('');
const pending = ref(false);

watch(
  () => [props.open, props.listId] as const,
  async ([open, listId]) => {
    if (!open || !listId) return;
    pending.value = true;
    qrDataUrl.value = '';
    try {
      const res = await $fetch('/api/list/share', { method: 'POST', body: { listId } });
      shareUrl.value = res.url;
      expiresAt.value = res.expiresAt;
      qrDataUrl.value = await QRCode.toDataURL(res.url, { margin: 1, width: 240 });
    } catch {
      toast('Could not create a share code');
      emit('update:open', false);
    } finally {
      pending.value = false;
    }
  },
  { immediate: true }
);

const copy = async () => {
  await navigator.clipboard.writeText(shareUrl.value);
  toast('Link copied');
};
</script>

<template>
  <Drawer :open="open" @update:open="emit('update:open', $event)">
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>Share this list</DrawerTitle>
        <DrawerDescription>
          Have them scan this with their camera. Anyone with this code can join the list until it
          expires.
        </DrawerDescription>
      </DrawerHeader>

      <div class="flex flex-col items-center gap-3 px-4 pb-6">
        <LoadingSpinner v-if="pending" />
        <img v-else-if="qrDataUrl" :src="qrDataUrl" alt="Share QR code" class="rounded-lg" />
        <Input :model-value="shareUrl" readonly class="w-full" />
        <Button variant="outline" class="w-full" @click="copy">Copy link</Button>
        <p v-if="expiresAt" class="text-xs text-gray-500">
          Expires {{ new Date(expiresAt).toLocaleString() }}
        </p>
      </div>
    </DrawerContent>
  </Drawer>
</template>
```

- [ ] **Step 4: Add the drawer flag**

In `app/store/drawers.ts`, add `isShareListDrawerOpen: false` alongside the existing flags, and remove `isInviteDrawerOpen`.

- [ ] **Step 5: Replace the invite entry point in `ListMenu.vue`**

Swap the `<InviteButton>` menu item for a share action, and mount the modal:

```vue
      <DropdownMenuItem>
        <button class="flex items-center justify-center gap-2" @click="drawerStore.isShareListDrawerOpen = true">
          <QrCode class="size-5" />
          Share
        </button>
      </DropdownMenuItem>
```

Add `QrCode` to the `lucide-vue-next` import, and place the modal beside the dropdown:

```vue
  <ShareListModal v-model:open="drawerStore.isShareListDrawerOpen" :list-id="selectedList?.id ?? null" />
```

- [ ] **Step 6: Add a revoke action to the modal**

The spec calls for the owner being able to revoke a code. Revocation is a plain
client update — `list_share_tokens` already carries a member-scoped update policy
from Task 2, so no endpoint is needed.

In `ShareListModal.vue`, add:

```ts
const supabase = useSupabaseClient();

const revoke = async () => {
  if (!shareUrl.value) return;
  const token = new URL(shareUrl.value).searchParams.get('t');
  const { error } = await supabase
    .from('list_share_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token', token);

  if (error) return toast('Could not revoke that code');
  toast('Code revoked');
  emit('update:open', false);
};
```

And a button beneath "Copy link":

```vue
        <Button variant="ghost" class="w-full text-red-500" @click="revoke">
          Revoke this code
        </Button>
```

- [ ] **Step 7: Verify**

Run: `pnpm dev`, open a list menu, tap Share.
Expected: a QR renders; the link is copyable; a row appears in `list_share_tokens`. Then sign in as a **non-member** and `POST /api/list/share` for that list id — expect `403`, proving RLS is doing the check.

- [ ] **Step 8: Commit**

```bash
git add server/api/list/share.post.ts app/components/lists/ShareListModal.vue app/components/lists/ListMenu.vue app/store/drawers.ts package.json pnpm-lock.yaml
git commit -m "feat: mint and display list share QR codes"
```

---

## Task 19: Redeem share tokens

**Files:**
- Create: `server/api/list/join.post.ts`
- Create: `app/pages/join.vue`
- Modify: `app/middleware/auth.global.ts`
- Test: `tests/unit/join-token.test.ts`

**Interfaces:**
- Consumes: `list_share_tokens`; `useSyncEngine().syncNow`.
- Produces:
  - `~~/utils/join-token.ts` exports `validateToken(row, now): 'ok' | 'expired' | 'revoked' | 'missing'`.
  - `POST /api/list/join` with body `{ token: string }` → `{ listId: string; listName: string }`.

**Context:** The joiner has no RLS access to the list until they are a member, so this endpoint uses the **service role** for exactly one insert, after validating the token itself. That is the only place in the app that bypasses RLS.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/join-token.test.ts
import { describe, it, expect } from 'vitest';
import { validateToken } from '~~/utils/join-token';

const NOW = new Date('2026-06-01T12:00:00.000Z');

describe('validateToken', () => {
  it('rejects a token that does not exist', () => {
    expect(validateToken(null, NOW)).toBe('missing');
  });

  it('accepts a live, unexpired token', () => {
    expect(validateToken({ expires_at: '2026-06-02T12:00:00.000Z', revoked_at: null }, NOW)).toBe('ok');
  });

  it('rejects an expired token', () => {
    expect(validateToken({ expires_at: '2026-05-31T12:00:00.000Z', revoked_at: null }, NOW)).toBe('expired');
  });

  it('rejects a revoked token even while unexpired', () => {
    expect(validateToken({ expires_at: '2026-06-02T12:00:00.000Z', revoked_at: '2026-06-01T09:00:00.000Z' }, NOW)).toBe('revoked');
  });

  it('treats the exact expiry instant as expired', () => {
    expect(validateToken({ expires_at: '2026-06-01T12:00:00.000Z', revoked_at: null }, NOW)).toBe('expired');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/join-token.test.ts`
Expected: FAIL — cannot resolve `~~/utils/join-token`.

- [ ] **Step 3: Write the validator**

```ts
// utils/join-token.ts

export interface ShareTokenRow {
  expires_at: string;
  revoked_at: string | null;
}

export type TokenVerdict = 'ok' | 'expired' | 'revoked' | 'missing';

/** Revocation is checked before expiry so a revoked token never reads as merely stale. */
export function validateToken(row: ShareTokenRow | null, now: Date): TokenVerdict {
  if (!row) return 'missing';
  if (row.revoked_at !== null) return 'revoked';
  if (new Date(row.expires_at).getTime() <= now.getTime()) return 'expired';
  return 'ok';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/join-token.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the join endpoint**

```ts
// server/api/list/join.post.ts
import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server';
import { validateToken } from '~~/utils/join-token';

const REASON: Record<string, string> = {
  missing: 'That share code is not valid.',
  expired: 'That share code has expired. Ask for a new one.',
  revoked: 'That share code was revoked.'
};

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: 'Sign in to join a list' });

  const { token } = await readBody<{ token?: string }>(event);
  if (!token) throw createError({ statusCode: 400, message: 'Missing token' });

  // Service role: the joiner has no RLS access to this list yet, so neither
  // the token lookup nor the membership insert can go through their client.
  // This is the only RLS bypass in the app; the token check below is what
  // stands in for the policy.
  const admin = serverSupabaseServiceRole(event);

  const { data: tokenRow } = await admin
    .from('list_share_tokens')
    .select('list_id, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle();

  const verdict = validateToken(tokenRow, new Date());
  if (verdict !== 'ok') throw createError({ statusCode: 403, message: REASON[verdict] });

  const { data: list } = await admin
    .from('lists_v2')
    .select('id, name, deleted_at')
    .eq('id', tokenRow!.list_id)
    .maybeSingle();

  if (!list || list.deleted_at) {
    throw createError({ statusCode: 404, message: 'That list no longer exists.' });
  }

  // Upsert on (list_id, email): re-scanning a code, or rejoining a list you
  // previously left, must not fail or create a second membership row.
  const { error } = await admin.from('list_members').upsert(
    {
      id: crypto.randomUUID(),
      list_id: list.id,
      user_id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
      avatar: user.user_metadata?.picture ?? null,
      role: 'member',
      updated_at: new Date().toISOString(),
      deleted_at: null
    },
    { onConflict: 'list_id,email' }
  );
  if (error) throw createError({ statusCode: 500, message: 'Could not join the list' });

  return { listId: list.id, listName: list.name };
});
```

- [ ] **Step 6: Write the join page**

```vue
<!-- app/pages/join.vue -->
<script setup lang="ts">
import { toast } from 'vue-sonner';

definePageMeta({ layout: 'empty' });

const route = useRoute();
const user = useSupabaseUser();
const { syncNow } = useSyncEngine();

const state = ref<'idle' | 'joining' | 'done' | 'failed'>('idle');
const message = ref('');
const listName = ref('');

async function join() {
  const token = route.query.t as string | undefined;
  if (!token) {
    state.value = 'failed';
    message.value = 'That link is missing its share code.';
    return;
  }

  state.value = 'joining';
  try {
    const res = await $fetch('/api/list/join', { method: 'POST', body: { token } });
    listName.value = res.listName;
    // Pull the newly-visible list and its items before leaving this page,
    // so the destination is not briefly empty.
    await syncNow();
    state.value = 'done';
    toast(`Joined ${res.listName}`);
  } catch (e: any) {
    state.value = 'failed';
    message.value = e?.data?.message ?? 'Could not join that list.';
  }
}

// Signing in redirects back here with the token intact, so re-run on login.
watch(user, (u) => { if (u && state.value === 'idle') void join(); }, { immediate: true });
</script>

<template>
  <div class="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
    <template v-if="!user">
      <p>Sign in to join this list.</p>
      <NuxtLink to="/login"><Button>Sign in</Button></NuxtLink>
    </template>

    <LoadingSpinner v-else-if="state === 'joining'" />

    <template v-else-if="state === 'done'">
      <p class="text-lg font-medium">You've joined {{ listName }}.</p>
      <NuxtLink to="/inventory"><Button>Open it</Button></NuxtLink>
    </template>

    <template v-else-if="state === 'failed'">
      <p class="text-red-500">{{ message }}</p>
      <NuxtLink to="/inventory"><Button variant="outline">Go back</Button></NuxtLink>
    </template>
  </div>
</template>
```

- [ ] **Step 7: Let `/join` through the auth guard**

In `app/middleware/auth.global.ts`, the signed-in redirect list must not swallow `/join`, or a logged-in user scanning a code gets bounced to `/inventory` before redeeming it. The route is already absent from `protectedAppRoutes` and `navigateToAppRoutes`, so confirm by adding an explicit early return:

```ts
export default defineNuxtRouteMiddleware((to) => {
  // /join carries a one-time share token and must resolve on its own page,
  // signed in or not.
  if (to.path === '/join') return;

  const user = useSupabaseUser();
  const protectedAppRoutes = ['/inventory', 'buy', '/settings', '/recipe', 'recipe/ai'];
  if (protectedAppRoutes?.includes(to.path) && !user.value) {
    return navigateTo('/');
  }
  const navigateToAppRoutes = ['/', '/login', '/confirm'];
  if (navigateToAppRoutes?.includes(to.path) && user.value) {
    return navigateTo('/inventory');
  }
});
```

- [ ] **Step 8: Add the service-role key**

`serverSupabaseServiceRole` needs `SUPABASE_SERVICE_KEY` in `.env`. Copy it from Supabase Dashboard → Project Settings → API → `service_role`.

```bash
echo "SUPABASE_SERVICE_KEY=<paste service_role key>" >> .env
```

Confirm `.env` is gitignored — it is, per `.gitignore`. **Never commit this key**; it bypasses RLS entirely.

- [ ] **Step 9: Verify end to end**

With two browser profiles signed in as different accounts:
1. Profile A shares a list; scan or paste the URL into profile B.
2. Expected: B joins, sees the list and its items, and appears in A's member avatars.
3. Scan the same code again in B. Expected: succeeds silently, still one membership row.
4. Revoke the token (`update list_share_tokens set revoked_at = now()`), scan again in a third profile. Expected: "That share code was revoked."

- [ ] **Step 10: Commit**

```bash
pnpm test
git add utils/join-token.ts server/api/list/join.post.ts app/pages/join.vue app/middleware/auth.global.ts tests/unit/join-token.test.ts
git commit -m "feat: redeem list share codes to join a list"
```

---

## Task 20: Remove the invite flow

**Files:**
- Delete: `app/store/invites.ts`, `app/components/lists/InviteButton.vue`, `server/api/invite.ts`
- Modify: any file importing them

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. This task only removes code made dead by Tasks 18 and 19.

- [ ] **Step 1: Find every reference**

```bash
grep -rn "useInviteStore\|InviteButton\|isInviteDrawerOpen\|/api/invite\|sentInvites\|receivedInvites" app/ server/
```

Record the list — expect hits in `ListMenu.vue`, `ListSelector.vue`, `app/store/list.ts`, and `app/store/drawers.ts`.

- [ ] **Step 2: Remove the call sites**

In each file found above, delete the invite import, the `inviteStore` local, and any template block rendering pending invites. In `app/store/list.ts`, `setSelectedList` no longer calls `inviteStore.getInvites()` — Task 13 already rewrote that file, so confirm no stray import remains.

- [ ] **Step 3: Delete the files**

```bash
git rm app/store/invites.ts app/components/lists/InviteButton.vue server/api/invite.ts
```

- [ ] **Step 4: Confirm nothing dangles**

```bash
grep -rn "useInviteStore\|InviteButton\|isInviteDrawerOpen\|/api/invite" app/ server/
```

Expected: no matches.

- [ ] **Step 5: Verify the app still builds**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor!: remove email invite flow, superseded by QR sharing"
```

---

## Task 21: Export, import and clear local data

**Files:**
- Create: `utils/download.ts`
- Create: `utils/export.ts`
- Create: `app/components/settings/DataSection.vue`
- Modify: `app/pages/settings.vue`
- Test: `tests/unit/export.test.ts`

**Interfaces:**
- Consumes: `db`; `clearLocalData` and `useSyncEngine` from `~/composables/useSyncEngine`.
- Produces:
  - `downloadFile(content: string, filename: string, mime: string): void`
  - `buildExportPayload(lists, items, recipes, settings): ExportPayload`
  - `isValidPayload(data: unknown): data is ExportPayload`
  - `summarizeImport(payload, existingIds): ImportSummaryItem[]`
  - `EXPORT_VERSION = 1`

**Context:** Import is **additive and never overwrites** — IDs already present locally are skipped. That makes a double import harmless and means a stale export can never roll back newer data.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/export.test.ts
import { describe, it, expect } from 'vitest';
import { buildExportPayload, isValidPayload, summarizeImport, EXPORT_VERSION } from '~~/utils/export';

const list = (id: string) => ({ id, name: 'Groceries', owner: 'u', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null });
const item = (id: string) => ({
  id, list_id: 'l1', name: 'milk', location: '', store: '', amount: 1,
  amount_to_purchase: 0, amount_type: 'count', default_amount: 1,
  created_by: null, updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null
});

describe('buildExportPayload', () => {
  it('stamps the version and carries every collection', () => {
    const p = buildExportPayload([list('l1')], [item('i1')], [], []);
    expect(p.version).toBe(EXPORT_VERSION);
    expect(p.lists).toHaveLength(1);
    expect(p.items).toHaveLength(1);
    expect(p.recipes).toEqual([]);
  });

  it('drops tombstoned rows, so an export is a clean snapshot', () => {
    const dead = { ...item('i2'), deleted_at: '2026-01-02T00:00:00.000Z' };
    const p = buildExportPayload([list('l1')], [item('i1'), dead], [], []);
    expect(p.items.map((i) => i.id)).toEqual(['i1']);
  });
});

describe('isValidPayload', () => {
  it('accepts a well-formed payload', () => {
    expect(isValidPayload({ version: 1, lists: [], items: [], recipes: [], user_settings: [] })).toBe(true);
  });

  it('rejects a non-object', () => {
    expect(isValidPayload('nope')).toBe(false);
    expect(isValidPayload(null)).toBe(false);
  });

  it('rejects a payload missing a collection', () => {
    expect(isValidPayload({ version: 1, lists: [], items: [] })).toBe(false);
  });

  it('rejects a payload with no version', () => {
    expect(isValidPayload({ lists: [], items: [], recipes: [], user_settings: [] })).toBe(false);
  });
});

describe('summarizeImport', () => {
  it('counts new against already-present ids', () => {
    const payload = { version: 1, lists: [list('l1'), list('l2')], items: [item('i1')], recipes: [], user_settings: [] };
    const summary = summarizeImport(payload, {
      lists: new Set(['l1']), items: new Set(), recipes: new Set(), user_settings: new Set()
    });

    const lists = summary.find((s) => s.label === 'lists')!;
    expect(lists).toMatchObject({ total: 2, newCount: 1, skipCount: 1 });
    expect(summary.find((s) => s.label === 'items')).toMatchObject({ total: 1, newCount: 1, skipCount: 0 });
  });

  it('reports everything as skipped on a second import of the same file', () => {
    const payload = { version: 1, lists: [list('l1')], items: [], recipes: [], user_settings: [] };
    const summary = summarizeImport(payload, {
      lists: new Set(['l1']), items: new Set(), recipes: new Set(), user_settings: new Set()
    });
    expect(summary.find((s) => s.label === 'lists')).toMatchObject({ newCount: 0, skipCount: 1 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/export.test.ts`
Expected: FAIL — cannot resolve `~~/utils/export`.

- [ ] **Step 3: Write the helpers**

```ts
// utils/download.ts
export function downloadFile(content: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

```ts
// utils/export.ts
import type { ListRecord, ItemRecord, RecipeRecord, UserSettingsRecord, SyncRecord } from '~~/types/sync';

export const EXPORT_VERSION = 1;

export interface ExportPayload {
  version: number;
  lists: ListRecord[];
  items: ItemRecord[];
  recipes: RecipeRecord[];
  user_settings: UserSettingsRecord[];
}

export interface ImportSummaryItem {
  label: string;
  total: number;
  newCount: number;
  skipCount: number;
}

const alive = <T extends SyncRecord>(rows: T[]): T[] => rows.filter((r) => r.deleted_at === null);

/** Tombstones are dropped: an export is a snapshot, not a change log. */
export function buildExportPayload(
  lists: ListRecord[],
  items: ItemRecord[],
  recipes: RecipeRecord[],
  settings: UserSettingsRecord[]
): ExportPayload {
  return {
    version: EXPORT_VERSION,
    lists: alive(lists),
    items: alive(items),
    recipes: alive(recipes),
    user_settings: alive(settings)
  };
}

export function isValidPayload(data: unknown): data is ExportPayload {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.version === 'number' &&
    Array.isArray(d.lists) &&
    Array.isArray(d.items) &&
    Array.isArray(d.recipes) &&
    Array.isArray(d.user_settings)
  );
}

type IdSets = Record<'lists' | 'items' | 'recipes' | 'user_settings', Set<string>>;

export function summarizeImport(payload: ExportPayload, existing: IdSets): ImportSummaryItem[] {
  const collections: (keyof IdSets)[] = ['lists', 'items', 'recipes', 'user_settings'];
  return collections.map((key) => {
    const rows = payload[key] as { id: string }[];
    const newCount = rows.filter((r) => !existing[key].has(r.id)).length;
    return { label: key, total: rows.length, newCount, skipCount: rows.length - newCount };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/export.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write the settings section**

```vue
<!-- app/components/settings/DataSection.vue -->
<script setup lang="ts">
import { toast } from 'vue-sonner';
import { db } from '~~/utils/db';
import { downloadFile } from '~~/utils/download';
import {
  buildExportPayload, isValidPayload, summarizeImport,
  type ExportPayload, type ImportSummaryItem
} from '~~/utils/export';

const { syncNow } = useSyncEngine();

const fileInputRef = ref<HTMLInputElement | null>(null);
const isConfirmOpen = ref(false);
const importSummary = ref<ImportSummaryItem[]>([]);
const pendingImport = ref<ExportPayload | null>(null);

async function exportJSON() {
  const [lists, items, recipes, settings] = await Promise.all([
    db.lists.toArray(), db.items.toArray(), db.recipes.toArray(), db.user_settings.toArray()
  ]);
  const payload = buildExportPayload(lists, items, recipes, settings);
  const today = new Date().toISOString().slice(0, 10);
  downloadFile(JSON.stringify(payload, null, 2), `fooderino-export-${today}.json`, 'application/json');
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // allow re-selecting the same file after an error
  if (!file) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    toast('Import failed: that file is not valid JSON');
    return;
  }

  if (!isValidPayload(parsed)) {
    toast('Import failed: unrecognised format');
    return;
  }

  const [lists, items, recipes, settings] = await Promise.all([
    db.lists.toCollection().primaryKeys(), db.items.toCollection().primaryKeys(),
    db.recipes.toCollection().primaryKeys(), db.user_settings.toCollection().primaryKeys()
  ]);

  importSummary.value = summarizeImport(parsed, {
    lists: new Set(lists as string[]), items: new Set(items as string[]),
    recipes: new Set(recipes as string[]), user_settings: new Set(settings as string[])
  });
  pendingImport.value = parsed;
  isConfirmOpen.value = true;
}

async function confirmImport() {
  isConfirmOpen.value = false;
  const payload = pendingImport.value;
  pendingImport.value = null;
  if (!payload) return;

  try {
    // bulkPut with allKeys:false would overwrite; bulkAdd on filtered rows
    // keeps import strictly additive.
    const existing = {
      lists: new Set((await db.lists.toCollection().primaryKeys()) as string[]),
      items: new Set((await db.items.toCollection().primaryKeys()) as string[]),
      recipes: new Set((await db.recipes.toCollection().primaryKeys()) as string[]),
      user_settings: new Set((await db.user_settings.toCollection().primaryKeys()) as string[])
    };

    await db.transaction('rw', db.lists, db.items, db.recipes, db.user_settings, async () => {
      await db.lists.bulkAdd(payload.lists.filter((r) => !existing.lists.has(r.id)));
      await db.items.bulkAdd(payload.items.filter((r) => !existing.items.has(r.id)));
      await db.recipes.bulkAdd(payload.recipes.filter((r) => !existing.recipes.has(r.id)));
      await db.user_settings.bulkAdd(payload.user_settings.filter((r) => !existing.user_settings.has(r.id)));
    });

    const added = importSummary.value.reduce((n, s) => n + s.newCount, 0);
    toast(`Import complete — ${added} record${added === 1 ? '' : 's'} added`);
    await syncNow();
  } catch (err) {
    toast(`Import failed: ${(err as Error).message}`);
  }
}

async function clearLocal() {
  await clearLocalData();
  await syncNow();
  toast('Local data cleared and re-synced');
}
</script>

<template>
  <div class="space-y-2">
    <Button variant="outline" class="w-full justify-start" @click="exportJSON">Export JSON</Button>
    <Button variant="outline" class="w-full justify-start" @click="fileInputRef?.click()">
      Import JSON
    </Button>
    <Button variant="outline" class="w-full justify-start text-red-500" @click="clearLocal">
      Clear local data
    </Button>
    <input ref="fileInputRef" type="file" accept=".json" class="hidden" @change="onFileSelected" />

    <Drawer v-model:open="isConfirmOpen">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Import summary</DrawerTitle>
          <DrawerDescription>Records already on this device are skipped.</DrawerDescription>
        </DrawerHeader>
        <div class="space-y-4 px-4 pb-6">
          <ul class="space-y-1 text-sm">
            <li v-for="row in importSummary" :key="row.label">
              <span class="font-medium capitalize">{{ row.label }}</span>: {{ row.total }} total
              ({{ row.newCount }} new, {{ row.skipCount }} already here)
            </li>
          </ul>
          <div class="flex gap-3">
            <Button class="flex-1" @click="confirmImport">Import</Button>
            <Button variant="outline" class="flex-1" @click="isConfirmOpen = false">Cancel</Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  </div>
</template>
```

- [ ] **Step 6: Mount it in settings**

In `app/pages/settings.vue`, add a Data section rendering `<DataSection />` and a `<SyncStatus />` indicator near the top.

- [ ] **Step 7: Verify the round trip**

Run: `pnpm dev`.
1. Export. Open the file — it has a `version` and four arrays.
2. Import the same file. Expected: everything reports as skipped; nothing duplicates.
3. Clear local data, then import the file. Expected: records return.

- [ ] **Step 8: Commit**

```bash
pnpm test
git add utils/download.ts utils/export.ts app/components/settings/DataSection.vue app/pages/settings.vue tests/unit/export.test.ts
git commit -m "feat: add JSON export, additive import and clear-local-data"
```

---

## Task 22: Cleanup

**Files:**
- Modify: `nuxt.config.ts:118-133` (the `supabase-cache` runtime caching rule)
- Modify: `README.md`
- Delete (after soak): the legacy tables

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Remove the Supabase runtime cache rule**

`nuxt.config.ts` currently NetworkFirst-caches every Supabase response for 5 minutes. Dexie is the cache now, and that rule serves stale sync payloads that actively fight the engine. Delete this entry from `pwa.workbox.runtimeCaching`:

```js
        {
          urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'supabase-cache',
            expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
            networkTimeoutSeconds: 10
          }
        },
```

Leave the Google-fonts and image rules in place.

- [ ] **Step 2: Verify the service worker no longer intercepts Supabase**

Run: `pnpm build && pnpm preview`. In DevTools → Network, filter for `supabase.co`.
Expected: requests show as network requests, not `(ServiceWorker)`.

- [ ] **Step 3: Document the architecture**

Replace the stock Nuxt boilerplate in `README.md` with a short section covering: Dexie is the source of truth; `supabase/schema-v2.sql` must be applied before first run; `SUPABASE_SERVICE_KEY` is required for `/api/list/join`; and `pnpm test` runs the sync unit tests.

- [ ] **Step 4: Commit**

```bash
git add nuxt.config.ts README.md
git commit -m "chore: drop supabase runtime cache, document local-first setup"
```

- [ ] **Step 5: Soak, then drop the legacy tables**

**Do not run this until the app has run on v2 for at least two weeks** and `supabase/verify-v2.sql` still reports clean. Until then the legacy tables are the rollback path.

```sql
-- supabase/drop-legacy.sql — run only after the soak period
drop table if exists public.invites;
drop table if exists public.items;
drop table if exists public.logs;
drop table if exists public.recipes;
drop table if exists public.lists;
```

Keep `public.users` — it still holds `ai` and `free_ai_calls`.

---

## Verification checklist

Run through this after Task 22, with two accounts and two browser profiles:

- [ ] Existing account signs in and sees all pre-migration lists, items and recipes.
- [ ] Creating an item is instant, with no network round trip visible in DevTools.
- [ ] Going offline, editing, and returning online reconciles without loss.
- [ ] Two profiles each tapping `+1` on the same item converge on `+2`.
- [ ] The same, with one profile offline throughout, still converges on `+2`.
- [ ] Deleting an item on one device removes it from the other.
- [ ] Scanning a share QR joins the list and pulls its items.
- [ ] An expired or revoked code is refused with a readable message.
- [ ] Signing in as a second account on one browser shows none of the first account's data.
- [ ] Editing `free_ai_calls` in IndexedDB does not raise the AI limit.
- [ ] Export → clear local data → import restores everything.
- [ ] `pnpm test` passes; `pnpm build` succeeds.
