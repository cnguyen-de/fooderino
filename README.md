# Fooderino

A local-first grocery list and recipe app built on Nuxt (`ssr: false`), Dexie and Supabase.

## How data flows

- **The device holds one household.** Dexie keeps the confirmed server state of the user's
  household plus two outboxes: `commands` (state changes such as "used one", "ticked",
  "unpacked") and `edits` (item metadata sheets). `usePantry()` replays the outbox over the
  confirmed state in memory, so every tap shows at once, offline included.
- **Commands are applied by the server, in order.** `utils/sync-engine.ts` drains the outbox
  through the `apply_commands` RPC, 50 at a time. Each command id is minted once, so a retry
  is a no-op. A command the server refuses (say, two people used the last milk) is dropped and
  shown as a toast; it never blocks the queue.
- **Pulls follow the server's `seq`.** Every household write takes the next position on a
  per-household clock, so each table pulls exactly `seq > cursor`. Realtime only nudges a pull.
  Item metadata and recipes stay last-write-wins.
- **Households are joined by QR code.** `POST /api/household/share` mints a 24-hour token, and
  `/join?t=…` redeems it through `POST /api/household/join`, optionally bringing your items.
  Create, pick and leave live beside it under `server/api/household/`.
- **Settings → Data** exports the household and recipes to JSON, imports an export additively
  (list-era v1 files included), and can clear local data and re-download it.
- **Activity** (`/logs`, also linked from each item's editor) shows household changes,
  including pending offline actions. Search by item, member or action, or view one item's history.
- **Cook this recipe** previews ingredient matches and quantities before deducting them from
  home. Names and aliases both match; missing or ambiguous ingredients are left for review.
  The selected ingredients are recorded as usage, with one Undo for the dish.
- **Items have alternate names.** Add them under **More options → Other names** in the editor;
  search matches every name, ignoring case and accents. Places and stores can be picked from
  existing tags or entered in the same field. New items use count units, including recipe and
  data imports; a default amount of zero is valid.
- **Sync belongs to the session.** Page navigation reuses local data and the existing Realtime
  subscription. Realtime notifications arriving together trigger one refresh.

The design lives in `docs/superpowers/specs/2026-11-16-household-redesign-design.md`.

## Setup

```bash
pnpm install
```

Create `.env` with:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_KEY` | Project URL and anon key |
| `SUPABASE_SERVICE_KEY` | Service-role key. The household routes use it to call `move_household`, the only writer of memberships. **Never commit it.** |
| `BASE_URL` | Public origin, used to build share links (defaults to `http://localhost:3000`) |

Apply `supabase/schema-v2.sql` to the database before the first run. Migrating an existing
database also needs `supabase/backfill-v2.sql`, then `supabase/verify-v2.sql` to check it.

## Scripts

```bash
pnpm dev        # dev server on http://localhost:3000
pnpm test       # unit tests (Vitest + fake-indexeddb)
pnpm test:e2e   # two devices against a local Supabase in Docker; never touches .env's project
pnpm build      # production build
pnpm preview    # preview the production build
```
