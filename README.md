# Fooderino

A local-first grocery list and recipe app built on Nuxt (`ssr: false`), Dexie and Supabase.

## How data flows

- **The device holds one household.** Dexie keeps the confirmed server state of the user's
  household plus two outboxes: `commands` (state changes such as "used one", "ticked",
  "unpacked") and `edits` (whole sheets: item metadata, recipes, cooked dishes and meal ingredients). `usePantry()`
  replays the outbox over the confirmed state in memory, so every tap shows at once, offline included.
- **Commands are applied by the server, in order.** `utils/sync-engine.ts` drains the outbox
  through the `apply_commands` RPC, 50 at a time. Each command id is minted once, so a retry
  is a no-op. A command the server refuses (say, two people used the last milk) is dropped and
  shown as a toast; it never blocks the queue.
- **Pulls follow the server's `seq`.** Every household write takes the next position on a
  per-household clock, so each table pulls exactly `seq > cursor`. Realtime only nudges a pull.
- **Sheets are last-write-wins.** Item metadata, recipes and cooked dishes are pushed whole, one
  store at a time in `utils/sync-registry.ts` order, so a dish never reaches the server ahead of
  its recipe. The server drops a sheet older than the row it holds.
- **Households are joined by QR code.** `POST /api/household/share` mints a 24-hour token, and
  `/join?t=…` redeems it through `POST /api/household/join`, optionally bringing your items.
  Create, pick and leave live beside it under `server/api/household/`.
- **Settings → Data** exports the household's items and recipes to JSON (meals stay out), imports
  an export additively (v1 and v2 files included), and can clear local data and re-download it.
  An imported recipe gets a new id and is skipped when a recipe of that name exists.
- **Activity** (`/logs`, also linked from each item's editor) shows household changes,
  including pending offline actions. Search by item, member or action, or view one item's history.
- **Recipes and meals belong to the household.** Every member sees and edits the same recipes.
  An ingredient is either picked from the items, and follows that item through renames and merges,
  or typed as a free name. A cooked dish records its date and the `use` commands that deducted its
  ingredients. An ingredient can also join a meal without a recipe, such as half a pack of tofu, or
  salt with no amount, which deducts nothing. Changing household removes the old household's recipes and meals from the device.
- **Items have alternate names.** Add them under **More options → Other names** in the editor;
  search matches every name, ignoring case and accents. Places and stores can be picked from
  existing tags or entered in the same field. New items use count units, including data imports;
  a default amount of zero is valid.
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

Apply `supabase/schema-v2.sql`, then `supabase/cook.sql`, then `supabase/seasons.sql`, then
`supabase/meal-ingredients.sql`, then `supabase/whole-meal.sql`, to the database before the first
run. An existing database gets `supabase/seasons.sql` before this client deploys, since the client
pushes the `season` column with every item sheet. It also gets `supabase/meal-ingredients.sql` before
this client deploys, since the client pulls the `meal_ingredients` table on every sync and a missing
table fails the pull. It also gets `supabase/whole-meal.sql` before this client deploys, since the
client pushes the `whole_meal` column with every recipe sheet and the server refuses a sheet with a
column it does not have. These three files are safe to run again.
Migrating an existing database also needs `supabase/backfill-v2.sql`, then `supabase/verify-v2.sql`
to check it. A database that predates recipes in households gets `supabase/cook.sql` before this
client deploys: it moves each user's saved recipes to their household.

## Scripts

```bash
pnpm dev        # dev server on http://localhost:3000
pnpm test       # unit tests (Vitest + fake-indexeddb)
pnpm test:e2e   # two devices against a local Supabase in Docker; never touches .env's project
pnpm build      # production build
pnpm preview    # preview the production build
```
