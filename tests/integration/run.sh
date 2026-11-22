#!/usr/bin/env bash
# Drives two sync engines through a real local Supabase (Postgres, PostgREST,
# GoTrue, Realtime). Starts the stack from tests/integration/supabase, resets
# its database, applies supabase/schema-v2.sql, cook.sql, seasons.sql and
# meal-ingredients.sql, builds and starts the Nitro server against it, then runs tests/integration.
# Usage: bash tests/integration/run.sh. STOP=1 stops the stack afterwards.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
cd "$repo"

supabase start --workdir tests/integration \
  -x imgproxy,vector,logflare,supavisor,postgres-meta,studio,mailpit,storage-api,edge-runtime >/dev/null
eval "$(supabase status --workdir tests/integration -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "refusing to run against $API_URL: not a local stack" >&2; exit 1 ;;
esac

supabase db reset --workdir tests/integration >/dev/null 2>&1
db="supabase_db_fooderino-e2e"
for sql in supabase/schema-v2.sql supabase/cook.sql supabase/seasons.sql supabase/meal-ingredients.sql; do
  docker exec -i "$db" psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1 < "$sql" 2>&1 \
    | grep -v ', skipping' || true
done
docker exec "$db" psql -X -q -U postgres -d postgres -c "notify pgrst, 'reload schema'"

# The household endpoints run in the real Nitro server, built against this stack only.
port=3999
SUPABASE_URL="$API_URL" SUPABASE_KEY="$ANON_KEY" SUPABASE_SERVICE_KEY="$SERVICE_ROLE_KEY" \
  NUXT_PUBLIC_BASE_URL="http://localhost:$port" npx nuxt build >/dev/null 2>&1
if grep -rqE 'https://[a-z0-9-]+\.supabase\.(co|in)' .output; then
  echo "refusing to start: the build references a hosted Supabase project" >&2
  exit 1
fi
PORT=$port NUXT_PUBLIC_SUPABASE_URL="$API_URL" NUXT_PUBLIC_SUPABASE_KEY="$ANON_KEY" NUXT_SUPABASE_SERVICE_KEY="$SERVICE_ROLE_KEY" \
  node .output/server/index.mjs >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -sf "http://localhost:$port/api/health" >/dev/null && break; sleep 0.5; done

status=0
E2E_SUPABASE_URL="$API_URL" E2E_ANON_KEY="$ANON_KEY" E2E_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  E2E_NITRO_URL="http://localhost:$port" npx vitest run --config vitest.e2e.config.ts || status=$?

if [[ "${STOP:-0}" == "1" ]]; then supabase stop --workdir tests/integration >/dev/null; fi
exit $status
