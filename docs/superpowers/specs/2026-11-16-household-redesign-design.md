# Household Redesign — Technical Design

**Date:** 2026-11-16
**Product decisions:** `2026-11-16-household-redesign-decisions.md` (the spec this design serves).
**Supersedes, for items, lists and logs:** the corresponding parts of
`2026-08-25-local-first-sync-design.md`. Recipes keep their LWW sync unchanged.

## Synthesis decision

Two candidates were designed independently and cross-judged.

- **Candidate A (events as the op log).** Every action is a typed event. A trigger folds
  events into `amount`, `to_buy` and `best_before`. The bag is derived from events. It is
  small, but it is wrong under several races. Undo by negation breaks after a clipped
  decrement. A bag cancel and an unpack can both succeed. Pulled counters double-count
  pending events. Purchase time is recorded at unpack, not at the shop.
- **Candidate B (transactional commands).** Every gesture is a command applied by one server
  RPC, with conditional transitions and durable receipts. It is correct, but heavy: a
  household clock, duplicated optimistic stores, transfer tables, and `item_ops` kept
  beside events.

The cross-judge scored B 21/30 and A 14/30, and recommended B with simplification. **The base
is B's write model:** commands applied transactionally on the server, a `bag_entries` table
with conditional state transitions, rejection instead of clipping, and receipt-aware replay.
**Grafted from A:**

- the event table doubles as the receipt store, so there is no separate receipts table and no
  `item_ops`
- one `editItem` that routes metadata, counts and expiry
- a single reactive read facade (`usePantry().view`) over one in-memory household snapshot,
  instead of persisted optimistic projections
- the `stamp_lww` guard and server-stamped pull positions
- a device holds exactly one household, and membership changes reset local data

**Rejected from B:**

- persisted `confirmed*` twin stores, because pending commands are replayed in memory
- transfer mapping tables, because the join merge is one RPC with a revision check
- a three-unit model (`kg`), because units stay `count | gram` as today

## Verified defects in the current engine that this design removes

Each was verified by the cross-judge reading `local-first-sync@571d9cf`.

1. Pull cursors use client-written `updated_at` / `created_at`. A late offline push falls
   behind other devices' cursors and is never pulled.
2. Server upserts are blind. An older push overwrites a newer row, and the clients reject it
   forever.
3. `apply_item_op` bumps `items.updated_at`, so a counter change looks like a metadata edit.
4. Realtime replays every pending op over an incoming server count that may already include
   them. That's a double count.
5. `compact_item_ops` deletes op ids after 7 days, so a retried op whose ack was lost folds
   twice.
6. Paging is by offset, ordered by timestamp only, with no id tiebreak.
7. A rejected push wedges the outbox forever.
8. The backfill drops lists with a null `admin`.
9. `can_access_list` keeps an owner bypass, which conflicts with leaving a household.
10. `takePendingJoin` clears the token before redemption succeeds.

## Data shapes

### Server (`supabase/schema-v2.sql`, rewritten in place; v2 is not applied anywhere)

| Table | Written by | Notes |
|---|---|---|
| `households` | Nitro (create); LWW for `name` | `id` reuses the legacy `lists.id`, `legacy_id bigint unique`, `name`, `seq`, `updated_at`, `deleted_at` |
| `household_members` | Nitro / RPC only | `household_id`, `user_id`, `email`, `name`, `avatar`, `role`, `seq`, `updated_at`, `deleted_at`. A partial unique index on `user_id` (and on lower `email`) `where deleted_at is null` enforces **one household per person** |
| `household_candidates` | backfill, consumed by pick | migrated users in several lists. RLS: a user reads their own rows. No access to grocery data until picked |
| `household_share_tokens` | Nitro | the existing QR token, renamed. Stored hashed |
| `items` | LWW for metadata; RPC for state | `id`, `household_id`, `name`, `aliases text[]`, `tags jsonb` (`[{kind,name}]`, kind in place, store or other), `unit` (count or gram), `default_amount`, `shelf_life_days int null`, `merged_into uuid null`, plus **server-owned** `amount`, `to_buy`, `best_before`, then `seq`, `updated_at`, `deleted_at` |
| `bag_entries` | RPC only | `id`, `household_id`, `item_id`, `qty > 0`, `from_list` (qty taken off `to_buy`), `state` (open, unpacked or cancelled), `bought_at`, `closed_by_command`, `seq`. **Conditional transitions out of `open` only** |
| `item_events` | RPC only, append-only | `id`, `household_id`, `item_id`, `command_id`, `kind` (purchase, consume, waste, correction, dismiss), kind-specific non-null columns enforced per kind with `is not null` (a NULL check passes in Postgres), `reverses uuid unique null`, `occurred_at` (client gesture time), `actor`, `origin` (live, backfill or import), `seq` |
| `rejected_commands` | RPC | `command_id pk`, `household_id`, `actor`, `reason`, `seq`. This is the receipt for a rejection |
| `household_clocks` | triggers | `household_id pk`, `position bigint`. Every write to a household-scoped table takes `seq = position + 1` under the row lock, so `seq` order is commit order per household. That makes `(seq)` an exact pull cursor |
| `legacy_log_audit` | backfill | unparseable, ambiguous or unmatched legacy logs, kept for calibration. No client access |
| `recipes_v2` | unchanged LWW, per user | gains server-stamped `synced_at` for its pull cursor |

`items.tags` is a jsonb array and not a join table. Concurrent tag edits on one item are
whole-sheet LWW. That's accepted, because metadata edits are rare and deliberate.

**Receipts.** A command is *accepted* when `item_events` (or a state change it made) carries
its `command_id`, and *rejected* when `rejected_commands` has it. `apply_commands` checks
both before applying, so retries are idempotent forever. Nothing is compacted.

**Some commands emit no event** (`want`, `tick`, `cancel_bag`, `set_expiry`, `merge`). Those
record their `command_id` in `command_log(command_id pk, household_id, seq)`. To keep one
rule, **every** accepted command writes a `command_log` row, and events reference it.
`command_log` is the receipt table, and it is tiny.

### Commands (the only write path for state)

`types/pantry.ts` defines `Command` as a discriminated union. Every command carries `id`
(uuid, minted once per gesture and reused on retry), `household_id`, `item_id`, and `at`
(the client gesture time).

| kind | payload | server validation | effects (one transaction) |
|---|---|---|---|
| `use` | `qty`, `waste: boolean` | `amount >= qty` else reject `insufficient_stock` | `amount -= qty`; event consume or waste |
| `want` | `qty` (absolute target `to_buy`) | `qty >= 0` | `to_buy = qty` |
| `tick` | `bag_id`, `qty`, `from_list` | `from_list <= to_buy` else reject | `to_buy -= from_list`; insert `bag_entries(open)`; event `purchase(qty, occurred_at = at)` |
| `cancel_bag` | `bag_id` | entry is `open` else reject `bag_closed` | state cancelled; `to_buy += from_list`; event `correction` that `reverses` the purchase |
| `unpack` | `bag_id`, `best_before?`, `place?` | entry is `open` else reject `bag_closed` | state unpacked; `amount += qty`; expiry rule (below); a place tag is added if given and missing |
| `set` | `amount?`, `best_before?` (absolute) | values valid | sets them; event `correction(before, after)` |
| `undo` | `target` (a command id) | target accepted, not already undone, inverse still valid | the exact recorded inverse: `use` gets `amount += qty` and a correction that reverses the event; `want` restores the previous `to_buy` recorded in its log row; `set` restores `before`; `tick` delegates to `cancel_bag`; `unpack` gets `amount -= qty` only if `amount >= qty`, otherwise reject `cannot_undo` |
| `dismiss` | none | none | event `dismiss` (it snoozes the suggestion) |
| `merge` | `into` | both live, same household | `into.amount += src.amount`, `into.to_buy += src.to_buy`, `into.best_before = min`, aliases and tags union, src name becomes an alias of `into`; src gets `merged_into`; later commands on src resolve to `into` |

**The expiry rule at unpack:** if the stock before unpack was 0 or `best_before` is null, set
it to the given date. Otherwise take the min. If no date is given, `best_before` is untouched.

**Rejection** writes `rejected_commands` and has no effects. The client drops the command,
refreshes the item, and shows a toast ("Someone already used the last Milk"). That replaces
clipping.

### Metadata (LWW)

`name`, `aliases`, `tags`, `unit`, `default_amount`, `shelf_life_days`, `deleted_at` on
`items`, and `name` on `households`, stay record-level LWW through the existing push path.
These changes go with it:

- `stamp_lww` is a `before update` trigger. It drops an incoming row whose `updated_at` is
  older than the stored one, and stamps `seq`.
- The column grants exclude `amount`, `to_buy`, `best_before` and `merged_into` from client
  insert and update. Push omits them, and they are derived from `SERVER_OWNED_ITEM_FIELDS`.
  Item **creation** goes through the RPC as a `create` command. It carries the metadata plus
  `start: {amount?, to_buy?, best_before?}`, so the opening state is atomic with the row, and
  the column grants never meet a PostgREST upsert of a new row.

### Device (Dexie, **version 3**; version 2 is taken by the user_settings drop)

```
households: 'id'
members:    'id, user_id'
items:      'id, seq'
bag:        'id, item_id, seq'
events:     'id, item_id, occurred_at, seq'
commands:   'id, created_seq'          // the outbox: pending commands, in order
recipes:    'id, user_id, updated_at, deleted_at'
syncState:  'key'                      // + household_id, + per-table seq cursors
```

These are dropped on upgrade: `lists`, `list_members`, `logs`, `pendingOps` and `user_settings`.
Pending v1 ops are converted to commands before their store is dropped. A `delta` becomes
`use` or a relative `want` / `set` against the stored row. Anything unconvertible is
discarded and counted in a console warning.

Dexie holds **only confirmed server state** plus the outbox. The read model is

```
view = buildPantryView(fold(commands, confirmed), events, today)
```

computed in memory from one `liveQuery` snapshot. `fold` is the TS twin of the server
effects, `utils/pantry/reduce.ts` `applyCommand(state, cmd) -> state | Rejection`. A command
whose `id` already appears in the confirmed `command_log` (pulled through events or the bag
`closed_by_command`) or in rejections is skipped. That's receipt-aware replay, and it
removes defect 4.

A shared fixture file, `tests/fixtures/commands.json`, drives both `reduce.test.ts` and a SQL
replay in `verify-v2.sql`, so the two copies of the effect rules can't drift silently.

## Sync engine changes

- **Pull:** per table `where household_id = :h and seq > :cursor order by seq limit 1000`.
  It's exact, because `seq` is assigned in commit order under the household clock lock.
  Recipes use `synced_at` plus an `id` tiebreak.
- **Push metadata:** unchanged LWW upsert path, guarded server-side by `stamp_lww`.
- **Push commands:** `rpc('apply_commands', {commands})` with up to 50, in order. The response
  lists per-command `accepted | rejected(reason)` and the touched rows (items, bag, events)
  with their `seq`. One Dexie transaction writes those rows and deletes the acknowledged
  commands. Rejected commands are deleted and surfaced. **A transport or unknown error leaves
  the batch in place, and a validation rejection never wedges the queue** (defect 7).
- **Realtime:** a postgres_changes subscription filtered on `household_id` per table. It only
  triggers a pull. It never applies rows directly.
- **Membership:** `useHousehold` reads own membership on start, on reconnect and on Realtime
  member events. If the server's household differs from `syncState.household_id`, it calls
  `resetHouseholdData()`, which wipes the household stores and cursors and keeps recipes. It
  refuses while commands are pending, and drains first. `backfillJoinedLists` is deleted.

## Households, join and pick (Nitro + SQL RPC)

These endpoints live under `server/api/household/`. They call security-definer RPCs with the
service role, and pass the authenticated user id from the verified JWT.

- `status.get` returns `{ state: 'none' | 'choosing' | 'member', household?, candidates? }`.
- `create.post` creates a household plus an admin membership.
- `share.post` creates a token (moved from `list/`).
- `join.post {token, bring, request_id}` and `pick.post {household, import: id[], request_id}`
  call `move_household(...)`. It runs as one transaction: it locks the user, validates the
  token or candidate, and computes the merge **inside the transaction** (`plan_merge` in
  plpgsql: match by normalized name or alias, counts add, tags and aliases union, min expiry).
  It copies open bag entries, ends the old membership, and inserts the new one. A durable
  `household_moves(request_id pk, user_id, result)` makes retries return the first result.
- `leave.post {request_id}` ends the membership. Items stay with the household. The last
  member leaving archives the household.
- `utils/pending-join.ts` keeps the token until `join.post` succeeds (defect 10).
- The TS `planHouseholdMerge` in `utils/pantry/merge.ts` is the **preview** only, shown on the
  join and pick screens. The SQL decides.

## Suggestions (`utils/pantry/suggest.ts`, pure)

`suggest({ items, bag, events, today, rules }) -> { probablyNeed, ranOut, useSoon }`

- **Purchase history.** Purchase events whose `occurred_at` is in the last `rules.windowDays`
  (182), excluding those reversed. Events are resolved through `merged_into`, and aggregated
  per local calendar day (quantities summed).
- **Probably need.** At least `rules.minPurchaseDays` (3) purchase days. Let `gap` be the
  median gap in days between consecutive purchase days, and `qty` the median daily quantity.
  The item is due when `today - lastPurchaseDay >= ceil(rules.dueFraction (0.8) * gap)`. It is
  held back when `amount >= qty`, `to_buy > 0`, or an open bag entry exists. It is snoozed
  when the latest `dismiss` falls after the last purchase and `today < dismissDay + gap`.
- **Ran out.** `amount == 0` and no cadence. There must be a consume or waste event whose
  stock went from positive to 0 (the event records `after`), with no dismiss after it. It is
  held back by `to_buy > 0` or an open bag entry.
- **Use soon.** `amount > 0` and `best_before <= today + rules.useSoonDays` (3), soonest
  first, with overdue items included.
- `history.complete` is false until first hydration finishes. Probably need and Ran out are
  empty until then.
- `DEFAULT_RULES` is one exported object. A calibration script, `scripts/calibrate-suggestions.ts`,
  replays the legacy log export week by week and prints what would have been suggested.

## Search (`utils/pantry/search.ts`, pure)

`buildSearchIndex(items) -> (query) -> Hit[]`. It searches over name, aliases and tag names,
diacritic-folded and lowercased. Ranking is exact, then prefix, then word-prefix, then
substring, then edit distance ≤ 1 (≤ 2 for terms of 6 or more characters). Name and alias
hits rank above tag hits. Zero-stock items are included. It's memoized per snapshot.

## Public surface

```ts
// app/composables/usePantry.ts
const { view, search, ops } = usePantry();
view.value.home.useSoon / home.byPlace          // Home
view.value.shopping.byStore / probablyNeed / ranOut / bag   // Shopping
view.value.byId(id); view.value.history(id)
ops.createItem(draft) ops.editItem(id, edit)    // edit routes LWW vs `set`
ops.useUp(id, qty?) ops.bin(id, qty?) ops.addToShopping(id, qty?)
ops.tick(id, qty?) ops.cancelBag(bagId) ops.unpack(lines) ops.dismiss(id)
ops.merge(src, into) ops.undo(handle) ops.deleteItem(id)
// each op returns an UndoHandle | null

// app/composables/useHousehold.ts
state: { kind: 'loading' } | { kind: 'none' } | { kind: 'choosing'; candidates } | { kind: 'member'; household; members }
create(name) join(token, { bring }) pick(id, { import }) leave() share()
```

Components import only these two composables. A lint rule (`no-restricted-imports`) blocks
`utils/pantry/*` except `index.ts`, and blocks `utils/db` from `app/components` and
`app/pages`.

## Migration (`supabase/backfill-v2.sql`)

It runs once, with legacy writes frozen, guarded by `migration_runs(version pk)`. If v2 is
already recorded it is a no-op, so it never re-derives consumed candidates.

1. **Households.** Every legacy list, including those with a null admin, becomes a household
   with the same id.
2. **Membership census.** Collect `(list, email, role)` from `lists.users` plus `lists.admin`.
   An email in exactly one list becomes a member. An email in several lists becomes candidate
   rows with no membership. Users without an `auth.users` row stay email-only candidates, and
   are claimed on first login through the existing claim trigger, rewritten for candidates.
3. **Items.** Ids come from `uuid_v5(ns, 'item:' || legacy_id)`. `location` becomes a place
   tag and `store` a store tag (trimmed, blanks skipped). Counters and `best_before` are
   copied as-is, and `shelf_life_days` is null.
4. **Legacy logs.** Only `action in ('updated', 'inventory')` with a payload matching
   `^\s*(-?\d+(\.\d+)?)\s*(→|->)\s*(-?\d+(\.\d+)?)\s*$` qualify. The item resolves by
   normalized name within the list. **Exactly one** match is required, otherwise the row goes
   to `legacy_log_audit`. An increase becomes `purchase(qty = b - a)`, a decrease becomes
   `consume(qty = a - b, after = b)`, and equal becomes audit. The event id reuses the log id,
   `origin = 'backfill'`, and nothing is folded.
5. **Gates.** `verify-v2.sql` asserts conservation: households equal lists, census emails
   equal members plus candidates, items are preserved, and logs equal events plus audit. It
   also asserts one live membership per user, the fixture replay, and two-user RLS probes.

**Manual cutover (operator only):** apply `schema-v2.sql`, freeze writes, run the backfill,
run verify, deploy the client, then run `drop-legacy.sql` after a soak. Until the drop, the
legacy `logs` table must have RLS enabled (it's anon-readable today).

## Module map

**Created:**

- `types/pantry.ts`
- `utils/pantry/{index,ids,reduce,view,search,suggest,merge}.ts`
- `app/composables/{usePantry,useHousehold}.ts`
- `server/api/household/{status.get,create.post,share.post,join.post,pick.post,leave.post}.ts`
- `app/pages/{home,shop,household}.vue` and `app/components/pantry/*`
- `scripts/calibrate-suggestions.ts`
- `tests/fixtures/commands.json` and the tests for each pure module

**Changed:**

- `utils/db.ts` (v3)
- `utils/sync-{engine,registry,state,hook}.ts`
- `app/utils/supabase-transport.ts`
- `app/composables/useSyncEngine.ts`
- `utils/export.ts` (v2 payload; a v1 import maps location and store to tags)
- `utils/pending-join.ts`, `app/pages/join.vue`
- the recipe "add to shopping list" call sites
- `supabase/*.sql`
- the README

**Deleted:**

- `utils/{item-ops,ops,log-ops,list-ops}.ts`
- `app/composables/{useItems,useLists,useLogs}.ts`
- `app/store/{item,actions,list,logs}.ts`
- `app/components/lists/*` (except the QR scan modal, moved), and the item components
  replaced by `pantry/*`
- `server/api/list/*`
- `app/pages/{inventory,buy,shopping}.vue`
- the list-era tests

## Tradeoffs accepted

- We accept two copies of the effect rules (plpgsql and `reduce.ts`), in exchange for instant
  offline feedback. A shared fixture file gates both.
- We accept that concurrent metadata edits to one item lose the earlier sheet, in exchange for
  no per-field clocks or tag join table.
- We accept that an offline decrement of the last unit can be rejected later, with a toast, in
  exchange for never showing stock the household doesn't have.
- We accept that membership changes need the network, in exchange for a database-enforced
  one-household invariant.
- We accept a full re-hydrate on join, pick and leave, in exchange for never holding two
  households on a device.
- We accept that the household clock row serializes writes per household, in exchange for
  exact pull cursors. The write volume is a few people tapping.

## Contract amendments (from implementing the TS reducer)

These override the command table above where they differ.

1. A command emits at most one event, and its id equals the command id.
2. `tick` never rejects on the list. The server clamps `from_list` to the current `to_buy`, so
   two shoppers ticking the same item both get a bag entry and a purchase.
3. Undo of `unpack` reopens the bag entry, takes the quantity back off home stock, and
   restores the pre-unpack `best_before`.
4. `unpack` into empty stock with no date clears `best_before`.
5. `bag_entries.purchase_event` links the entry to its purchase, for `reverses`.
6. Only `use`, `want`, `set`, `tick` and `unpack` are undoable. Undo of a tick is a
   `cancel_bag`.
7. Merge: a stockless side contributes no date. The source's counters go to 0. A unit
   mismatch is `invalid`.
8. Undo after sync: the server's `command_log` holds each inverse and is the authority. The
   device keeps its own inverse log for commands it issued, so it can still predict an undo
   after the command is confirmed.
