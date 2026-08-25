# Local-First Sync — Design

**Date:** 2026-08-25
**Status:** Approved (pending spec review)

## Goal

Move Fooderino from a standard CRUD app — where every interaction round-trips to
Supabase — to a local-first app where IndexedDB is the source of truth and Supabase is a
background sync backend.

Success criteria:

1. **Every write is instant and works offline.** The UI never waits on the network. The
   1.7s debounce that currently papers over Supabase latency is deleted, not tuned.
2. **Shared lists keep working.** Two people editing one list converge, including when one
   of them was offline.
3. **Concurrent increments add up.** Two people tapping `+1` on the same item yields `+2`,
   not `+1`.
4. **Sharing happens by QR code.** Scanning a code joins you to a list; the email invite
   flow is removed.
5. **No existing account loses data.** All current rows are backfilled server-side, plus a
   user-facing JSON export/import as an escape hatch.

Non-goals:

- **End-to-end encryption.** Rows sync as plaintext under Row-Level Security. (The
  reference implementation this design borrows from is E2EE; that requirement was
  explicitly dropped — see "Divergences from the reference".)
- **Anonymous / logged-out use.** An account remains required to enter the app.
- **True CRDTs.** Conflict resolution is last-write-wins, with an operation log for the two
  counter fields where LWW is demonstrably wrong.
- **Real-time collaborative text editing** of any field.

## Reference implementation

The architecture is adapted from `../Private/time-management`, which solves the same
problem for a single-user time tracker. Carried over wholesale:

- Dexie as source of truth; UI reads via `liveQuery`, never from the network.
- Client-generated UUID primary keys on every synced record.
- `updatedAt` on every record; soft deletes via `deletedAt` tombstones so deletions
  propagate. No hard deletes on synced tables.
- Incremental pull driven by an `updated_at` cursor, paged at 1000 rows.
- Write-through push on local change, plus a catch-up sweep for anything written while
  offline.
- Realtime subscription for live cross-device updates.
- Last-write-wins merge by `updatedAt` string comparison.

Also worth inheriting are the hard-won details in `useSyncEngine.ts`: module-level
singletons for the Realtime channel so a component remount can tear down its predecessor
instead of leaking a duplicate subscription; an in-flight promise to dedupe concurrent
`start()` calls; and never leaving status stuck on `syncing` when startup throws.

## Divergences from the reference

| Reference | Here | Why |
|---|---|---|
| Single generic `sync_documents` blob table | Typed per-entity tables | No E2EE, and three things need the server to see real columns — see below |
| One AES-GCM DEK, QR-transferred between your own devices | No crypto at all; QR carries a list join token | E2EE dropped; sharing is between *people*, not devices |
| Single user, many devices | Many users per list | Fooderino's lists are shared; RLS must express membership |
| Record-level LWW everywhere | LWW, plus an op log for two counter fields | Two people shopping one list concurrently increment the same counters |
| `updatedAt > lastPushedAt` cursor is the only outbox | Cursor *plus* a durable `pendingOps` store | A `+1` is not reconstructable from record state |
| Zero server functions | Nitro retained | `/api/recipe` holds the OpenAI key and enforces a quota |

**On typed tables.** The reference uses one opaque blob table because the server cannot
read ciphertext anyway, so structure would be wasted. Without E2EE, three things actively
need real columns:

- `/api/recipe` reads the user's inventory item names to build its prompt.
- RLS must express *"is this user a member of this list"* — a join, not a `user_id =` check.
- Realtime filters on `list_id`.

The sync *engine* remains generic: one push/pull/merge loop parameterized over a table
registry. Only the storage is typed.

## Architecture

```
┌────────────── Device (PWA, ssr:false) ──────────────┐
│  Vue + Pinia  ──reads──►  Dexie (source of truth)   │
│       │                        ▲                     │
│       └──writes──► Dexie ──────┘                     │
│                      │ notifyLocalChange()           │
│                 Sync engine (client-only)            │
│                 ├─ outbox push (counter ops)         │
│                 ├─ dirty push (LWW records)          │
│                 ├─ incremental pull (updated_at)     │
│                 └─ Realtime subscribe                │
└──────────────────────┬───────────────────────────────┘
                       │ plaintext, RLS-scoped
              ┌────────▼────────┐      ┌─────────────────┐
              │ Supabase (v2    │      │ Nitro (kept)    │
              │ typed tables)   │      │ /api/recipe     │
              │ + Realtime      │      │ /api/list/share │
              └─────────────────┘      │ /api/list/join  │
                                       └─────────────────┘
```

The app is already `ssr: false`, so the sync layer runs only in the browser and SSR is
never involved.

### Pinia's role inverts

Today the six stores in `app/store/` *are* the data layer: `fetchItems()` queries
Supabase, `updateItem()` writes to Supabase, and a debounce hides the latency.

After this change, stores hold only UI state — `selectedItems`, `filterInput`,
`selectedList`, drawer state, filter getters — and data arrives from Dexie `liveQuery`
subscriptions. Every `fetch*()` method and the `debouncedFetchItems` timer are deleted.

`app/store/actions.ts` currently reimplements a purchase buffer in `localStorage` with its
own undo/redo stack. That collapses into ordinary counter ops: undo is a compensating
delta, and the buffer is just Dexie.

## Data model

### Supabase

| Table | Purpose | Key columns |
|---|---|---|
| `lists_v2` | the list itself | `id uuid pk`, `legacy_id int`, `name`, `owner uuid`, `updated_at`, `deleted_at` |
| `list_members` | membership, normalized out of today's `lists.users` JSON array | `list_id`, `user_id`, `email`, `name`, `avatar`, `role`, `updated_at`, `deleted_at` |
| `list_share_tokens` | QR join tokens | `token pk`, `list_id`, `created_by`, `expires_at`, `revoked_at` |
| `items_v2` | items, with materialized amounts | `id uuid pk`, `legacy_id`, `list_id uuid`, `name`, `location`, `store`, `amount`, `amount_to_purchase`, `amount_type`, `default_amount`, `created_by`, `updated_at`, `deleted_at` |
| `item_ops` | counter operation log | `id uuid pk`, `item_id`, `list_id`, `field`, `kind`, `value int`, `created_at`, `actor` |
| `logs_v2` | activity feed | `id uuid pk`, `list_id`, `actor_email`, `item_name`, `action`, `payload`, `created_at` |
| `recipes_v2` | per-user recipes | `id uuid pk`, `legacy_index`, `user_id`, `name`, `description`, `ingredients jsonb`, `instructions`, `saved`, `updated_at`, `deleted_at` |
| `user_settings` | synced preferences | `user_id pk`, `servings`, `allergies`, `cuisines`, `show_empty_items`, `no_inventory`, `updated_at` |
| `users` | **unchanged, server-authoritative** | `ai`, `free_ai_calls` |

`item_ops.field` is constrained to `('amount', 'amount_to_purchase')` and `kind` to
`('delta', 'set')`.

`times_updated` and `last_updated` from today's `items` table do not become synced fields.
`last_updated` is subsumed by `updated_at`; `times_updated` becomes derived if still needed
for sorting.

### The quota must not be local-first

`users.ai` and `users.free_ai_calls` stay on the server and are never written by the
client. If the quota lived in a client-writable local store, a user could grant themselves
unlimited AI generations by editing IndexedDB. `/api/recipe` remains the only writer; the
client caches the value read-only for display.

`user_settings` is split out precisely so that the genuinely user-owned preferences can
sync local-first without dragging the quota along.

### RLS

Two policy hazards to design around explicitly:

1. **Recursion.** A `lists_v2` policy that checks `list_members`, combined with a
   `list_members` policy that checks the list, recurses infinitely. Both policies instead
   call a `security definer` function:

   ```sql
   create function is_list_member(target uuid) returns boolean
   language sql security definer stable as $$
     select exists (
       select 1 from list_members
       where list_id = target and user_id = auth.uid() and deleted_at is null
     );
   $$;
   ```

2. **Join-before-membership.** A user redeeming a share token has no RLS access to the list
   yet, so token redemption cannot be a client-side insert. It goes through
   `/api/list/join`, which validates the token and performs that one insert with the
   service role.

`recipes_v2` and `user_settings` use a plain `user_id = auth.uid()` policy.

### Dexie

Mirrors the Supabase tables with string PKs, `updatedAt` and `deletedAt`, plus two
local-only stores:

- **`syncState`** (singleton) — `deviceId`, `userId`, `hydratedAt`, and per-table
  `lastPulledAt` / `lastPushedAt` cursors.
- **`pendingOps`** — durable queue of counter ops not yet confirmed pushed.

All read queries filter `deletedAt === null` through a shared helper, so tombstones never
surface in the UI.

Because Fooderino's local schema is being created fresh rather than migrated from an
existing Dexie database, the reference's painful v1→v4 dance (read rows in one version,
drop stores, recreate with string PKs, restore) is **not** needed here. The first Dexie
version already has UUID PKs.

## Counter semantics

Everything touching `amount` or `amount_to_purchase` is an **op**, never a direct field
write. This gives those two fields exactly one authority path and removes LWW ambiguity.

- **`delta`** — `addItemToBuy` (+1, or +100 for gram-typed items), `addItemToInventory`,
  the purchase confirmation flow, and undo/redo.
- **`set`** — the `EditItem` form, where the user types an absolute number. A set is still
  an op so that it orders against pending deltas by `created_at` rather than racing them.

Flow for a single tap:

```
1. Dexie: item.amount += 1                    ← UI updates instantly via liveQuery
2. Dexie: pendingOps.add({ id: uuid, itemId, field, kind: 'delta', value: +1 })
3. push:  insert into item_ops
4. trigger on item_ops insert:
     items_v2.amount = amount + value   (kind='delta')
     items_v2.amount = value            (kind='set')
     items_v2.updated_at = now()
5. on success: pendingOps.delete(id)
```

Ops carry a client-generated UUID primary key, so a retried push is a duplicate-key no-op.
That yields exactly-once application without any additional bookkeeping.

**Pull reconciliation rule.** When a pull returns a fresh `items_v2` row, the client takes
the server's `amount`, then **re-applies any still-pending local ops for that item on top**
before writing to Dexie. Without this, a pull landing mid-flight briefly shows the pre-tap
number and the tap appears lost.

**Compaction.** `item_ops` grows unbounded, so rows older than 7 days are deleted on a
schedule. They are already folded into the materialized column, so this is pure garbage
collection. A device offline longer than 7 days is unaffected: it pulls materialized state
and replays only its own still-pending ops, which is correct regardless of age.

Every other item field — `name`, `store`, `location`, `amount_type`, `default_amount` — is
plain record-level LWW on `updated_at`.

## Sync engine

One generic engine over a table registry:

```
start(): pushOutbox() → pushDirty() → pull() → subscribeRealtime()
```

- **pushOutbox** — drains `pendingOps` oldest-first. Runs *before* `pushDirty` so a delta
  never lands after an LWW write that would mask it.
- **pushDirty** — per table, rows where `updatedAt > lastPushedAt`, upserted; cursor
  advanced to the max pushed.
- **pull** — per table, rows where `updated_at > lastPulledAt`, ordered ascending, paged at
  1000, merged via `remoteWins()`, cursor advanced to the max seen. Tombstones win by
  recency like any other field.
- **Realtime** — one subscription per table. RLS scopes the stream to lists the user
  belongs to, so joining or leaving a list needs no manual filter juggling.
- **Status** — `idle | syncing | offline | error`, surfaced in the UI alongside a
  last-synced timestamp.

The engine is bootstrapped once from the app layout — not from the settings page — so it
runs regardless of route. (The reference learned this the hard way: mounting it in the
settings component meant entries added elsewhere did not sync until the user happened to
visit Settings.)

## Session handling

### Cold start

Signed in with an empty Dexie and a null `lastPulledAt` triggers a full pull of every
table. Until it completes the UI would show empty lists, which reads as data loss. So
`syncState.hydratedAt` gates a hydrating state, shown until the first pull finishes.

This replaces today's `listStore.isLoading`, except it covers all tables and fires only on
a genuinely first run rather than on every navigation.

### Account switching

IndexedDB is per-origin, not per-account. Without a guard, signing in as B on a browser
where A was signed in shows B all of A's groceries.

`syncState.userId` records who the local data belongs to. On sign-in, a mismatch wipes
every synced store and re-pulls from scratch. Sign-out leaves Dexie intact so the same user
re-logging in is instant; an explicit "Clear local data" action in Settings covers the
shared-device case.

`auth.global.ts` keeps its current behaviour — protected routes still redirect
unauthenticated users away.

## QR sharing

The QR encodes a **URL**, not a raw token — `https://<host>/join?t=<token>` — so the other
person can scan it with their phone's stock camera app and land in the browser. In-app
scanning with `jsQR` over a `<video>` element (as in the reference's `PairDeviceModal.vue`)
is a secondary path for when the app is already open.

```
Alice: ListMenu → "Share list"
  → POST /api/list/share → row in list_share_tokens (24h expiry, multi-use)
  → render QR of the join URL

Bob scans → /join?t=… → signs in if needed → POST /api/list/join
  → validate: token exists, not expired, not revoked
  → insert list_members(list_id, user_id: auth.uid(), email, name, avatar)
  → client pulls that list and its items
```

The list owner can revoke a token and remove a member from `ListMenu`.

**Removed by this:** the `invites` table, `app/store/invites.ts`,
`app/components/lists/InviteButton.vue`, `server/api/invite.ts`, and the pending-invite
state in `ListSelector.vue` / `UserList.vue`.

## Backfill

Old tables are never written to again — one read-only SQL pass builds the v2 tables.
`legacy_id` is retained on every row so the mapping is auditable and the pass is re-runnable
after a truncate if a bug turns up.

```sql
-- 1. lists → lists_v2, minting a uuid per legacy row
insert into lists_v2 (id, legacy_id, name, owner, updated_at, deleted_at)
select gen_random_uuid(), l.id, l.name, l.admin::uuid, now(), null
from lists l;

-- 2. explode lists.users jsonb array → list_members,
--    resolving email → user_id against auth.users
insert into list_members (list_id, user_id, email, name, avatar, role)
select v.id, au.id, u->>'email', u->>'name', u->>'avatar',
       case when (u->>'admin')::bool then 'admin' else 'member' end
from lists l
join lists_v2 v on v.legacy_id = l.id
cross join lateral jsonb_array_elements(l.users) u
left join auth.users au on au.email = u->>'email';

-- 3. items → items_v2, list_id remapped through legacy_id
-- 4. logs → logs_v2
-- 5. recipes → recipes_v2 (legacy_index from recipes.index, user_id from recipes.id)
```

Steps 1 and 2 are written out because they carry the decisions — uuid minting and the
JSON-array explosion. Steps 3 through 5 are the same mechanical shape (select from the old
table, join `*_v2` on `legacy_id` to remap references) and get written out in full in the
implementation plan. Note that `items.user` holds an email and maps to
`items_v2.created_by`; `items.times_updated` and `items.last_updated` are not carried over.

**Unregistered members.** A member email with no matching `auth.users` row — someone added
to a list who never signed up — lands with `user_id null`, keeping the email. A login
trigger claims any `list_members` row whose email matches and whose `user_id` is null, so
if they ever sign up they get their list. They simply do not sync until then.

**Pre-cutover verification:**

- Row counts match per table between old and v2.
- Zero `items_v2.list_id` values without a matching `lists_v2.id`.
- Every distinct email across all old `lists.users` arrays appears in `list_members`.
- RLS probed as two different users: each sees exactly their own lists.

Old tables are retained read-only through a soak period, then dropped.

## Export / import

A **Data** section in Settings, modelled on the reference's `DataSection.vue`:

- **Export JSON** — all local lists, items, recipes and settings, tombstones excluded,
  with a `version` field.
- **Import JSON** — validates shape, computes which IDs already exist locally, shows a
  summary (`N total, N new, N already exist — will be skipped`), and only inserts on
  confirmation. Import is additive and never overwrites.
- **Clear local data** — wipes Dexie and re-pulls.

## Logs

Log writes go through the same offline-capable path as everything else, so actions taken
offline still get recorded and pushed on reconnect. Locally, only the most recent ~200
entries per list are retained and older ones are pruned; the server keeps full history.
This keeps IndexedDB bounded without special-casing logs out of the architecture.

Logs are append-only: they have no `updatedAt` or `deletedAt` and never participate in LWW
merge. Both push and pull use `created_at` as the cursor instead of `updated_at`.

## Testing

Fooderino currently has no test tooling. Phase 0 adds `vitest`, `fake-indexeddb`,
`@vue/test-utils` and `@nuxt/test-utils`, matching the reference's setup.

- **Unit, against fake-indexeddb:** merge/LWW rules including tombstone recency; the pull
  reconciliation rule (server value + pending ops replayed on top); op application order
  for interleaved `delta` and `set`; cursor advancement; the account-mismatch wipe.
- **Unit, against a mocked Supabase client:** push retry producing a duplicate-key no-op;
  pull paging past the 1000-row boundary; status transitions never sticking on `syncing`.
- **Manual two-browser check per phase:** concurrent `+1` from two sessions summing
  correctly, including with one session offline for the duration.

## Phases

| # | Phase | Verification | Reversible |
|---|---|---|---|
| 0 | Test tooling; regenerate the stale `types/database.types.ts` (it currently describes tables that no longer match production) | `pnpm test` runs | n/a |
| 1 | v2 schema, RLS, `is_list_member()`, backfill SQL | the verification list above | yes — app still on old tables |
| 2 | Dexie schema, table registry, repositories, `notifyLocalChange` | unit tests on fake-indexeddb | yes — nothing wired in |
| 3 | Sync engine: outbox push, dirty push, pull, merge, Realtime | unit tests; two-browser manual check | yes — not yet driving UI |
| 4a | **Cut over lists** — reads and writes together | list CRUD runs entirely off Dexie | point of no return |
| 4b | **Cut over items** — including converting amount mutations to ops; delete the debounce and every `fetch*()` | offline edits reconcile; concurrent `+1` from two devices sums to `+2` | |
| 5 | Cut over logs, recipes, settings; split `user_settings` from server-owned `users.ai` / `users.free_ai_calls` | the AI quota cannot be raised by editing IndexedDB | |
| 6 | QR share and join; delete the invite flow | a second account joins by scanning and sees the list | |
| 7 | Export / import JSON and "Clear local data" in Settings | round-trip a full export through import | |
| 8 | Cleanup: drop old tables after soak; **remove the `supabase-cache` `runtimeCaching` rule from `nuxt.config.ts`** | | |

4a and 4b are split so lists can soak on the new path before items follow.

**Phase 8's config change is easy to miss.** `nuxt.config.ts` currently NetworkFirst-caches
all Supabase responses for 5 minutes. Once Dexie is the cache, that rule serves stale sync
payloads and actively fights the engine.

## Risks

- **Phase 4 is irreversible.** Once writes go to Dexie and the v2 tables, the old tables
  are stale. Mitigated by the split into 4a/4b, the pre-cutover verification, and the JSON
  export shipped in phase 7 — which is worth pulling forward if the soak reveals problems.
- **A device offline past the 7-day op-compaction window** pulls materialized state and
  replays its own pending ops. This is correct, but its deltas apply on top of a value that
  already moved, which can surprise. Acceptable for a grocery app.
- **RLS recursion** between `lists_v2` and `list_members` will silently blow the stack if
  the `security definer` helper is forgotten. Covered by a two-user RLS probe in phase 1.
- **Backfilled members with no account** cannot sync until they sign up. Surfaced in the
  member list as a pending state rather than failing silently.
- **`item_ops` write volume.** Every tap is an insert. For a personal grocery app on
  Supabase's free tier this is ample headroom, but it is the first thing to watch if usage
  grows.
