#!/usr/bin/env bash
# Applies the v2 schema, cook.sql, seasons.sql, meal-ingredients.sql (twice, as it must be safe to
# rerun), backfill and verify to a throwaway Postgres 16 in Docker, then runs every supabase/tests/*.test.sql against it.
# Usage: bash supabase/tests/run.sh [name-filter]. KEEP=1 leaves the container up.
set -euo pipefail
shopt -s nullglob

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
filter="${1:-}"
container="fooderino-sqltest-$$"

cleanup() {
  if [[ "${KEEP:-0}" == "1" ]]; then
    echo "kept container $container (docker exec -it $container psql -U postgres)"
  else
    docker rm -f "$container" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

docker run -d --rm --name "$container" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -v "$repo:/repo:ro" \
  postgres:16 -c wal_level=logical >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$container" pg_isready -q -h 127.0.0.1 -U postgres 2>/dev/null; then break; fi
  sleep 0.5
done
docker exec "$container" pg_isready -q -h 127.0.0.1 -U postgres

run_file() {
  docker exec "$container" psql -X -q -h 127.0.0.1 -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -f "/repo/$1" 2>&1
}

step() {
  local label="$1" file="$2" out
  if ! out="$(run_file "$file")"; then
    echo "FAIL $label"
    echo "$out" | sed 's/^/    /'
    exit 1
  fi
  echo "ok   $label"
  if [[ "${VERBOSE:-0}" == "1" ]]; then echo "$out" | sed 's/^/    /'; fi
}

step "shim" supabase/tests/shim.sql
step "legacy seed" supabase/tests/legacy.sql
step "schema-v2.sql" supabase/schema-v2.sql
step "cook.sql" supabase/cook.sql
step "seasons.sql" supabase/seasons.sql
step "meal-ingredients.sql" supabase/meal-ingredients.sql
step "meal-ingredients.sql again" supabase/meal-ingredients.sql
step "backfill-v2.sql" supabase/backfill-v2.sql
step "verify-v2.sql" supabase/verify-v2.sql
step "test helpers" supabase/tests/helpers.sql

passed=0
for test in "$here"/*.test.sql; do
  name="$(basename "$test")"
  [[ -n "$filter" && "$name" != *"$filter"* ]] && continue
  if ! out="$(run_file "supabase/tests/$name")"; then
    echo "FAIL $name"
    echo "$out" | grep -v 'NOTICE:  ok - ' | sed 's/^psql:[^ ]* //; s/^/    /'
    exit 1
  fi
  n="$(grep -c 'NOTICE:  ok - ' <<<"$out" || true)"
  passed=$((passed + n))
  echo "ok   $name ($n assertions)"
  grep 'NOTICE:  ok - ' <<<"$out" | sed 's/.*NOTICE:  ok - /       /'
done

if [[ -z "$filter" ]]; then step "verify-v2.sql after live moves" supabase/verify-v2.sql; fi
echo "PASS: $passed assertions"
