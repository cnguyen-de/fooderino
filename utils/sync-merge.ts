import type { SyncRecord } from '~~/types/sync';

/**
 * Last-write-wins by `updated_at`. Tombstones carry no special weight: a
 * deletion is just a write, so whichever side wrote last wins either way.
 *
 * Equal timestamps lose, which makes pulling back a row we just pushed a
 * no-op rather than a redundant write.
 *
 * The comparison is a plain string `>`: ISO-8601 UTC strings sort
 * lexicographically in the same order they sort chronologically, so this
 * avoids parsing a `Date` for every merged row. It only holds because every
 * timestamp in the system is written by `new Date().toISOString()` or by
 * Postgres `now()` serialized as UTC.
 */
export function remoteWins(
  local: SyncRecord | undefined,
  remote: { updated_at: string }
): boolean {
  if (!local) return true;
  return remote.updated_at > local.updated_at;
}
