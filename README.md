# Fooderino

A local-first grocery list and recipe app built on Nuxt (`ssr: false`), Dexie and Supabase.

## How data flows

- **IndexedDB (Dexie) is the source of truth.** Components read through `liveQuery` and write
  to Dexie synchronously, so the UI never waits on the network.
- **Supabase syncs in the background.** `app/composables/useSyncEngine.ts` pushes dirty rows
  and a durable op queue, pulls incrementally on `updated_at`, and subscribes to Realtime.
  Conflicts resolve last-write-wins, except item `amount` / `amount_to_purchase`, which sync
  as `delta` / `set` ops folded by a Postgres trigger so concurrent increments add up.
- **Lists are shared by QR code.** `POST /api/list/share` mints a 24-hour, multi-use token;
  `/join?t=…` redeems it through `POST /api/list/join`.
- **Settings → Data** exports everything to JSON, imports an export additively, and can clear
  local data and re-download it.

The full design lives in `docs/superpowers/specs/2026-08-25-local-first-sync-design.md`.

## Setup

```bash
pnpm install
```

Create `.env` with:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_KEY` | Project URL and anon key |
| `SUPABASE_SERVICE_KEY` | Service-role key. Required by `/api/list/join`, the one route that bypasses RLS. **Never commit it.** |
| `OPENAI_API_KEY` | Recipe generation |
| `BASE_URL` | Public origin, used to build share links (defaults to `http://localhost:3000`) |

Apply `supabase/schema-v2.sql` to the database before the first run. Migrating an existing
database also needs `supabase/backfill-v2.sql`, then `supabase/verify-v2.sql` to check it.

## Scripts

```bash
pnpm dev        # dev server on http://localhost:3000
pnpm test       # sync engine and data-layer unit tests (Vitest + fake-indexeddb)
pnpm build      # production build
pnpm preview    # preview the production build
```
