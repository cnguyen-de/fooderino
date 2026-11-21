import type { Month, Season } from '~~/types/season';

export function isMonth(v: unknown): v is Month {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 12;
}

/** Exactly `{ from, to }`, both months: the shape the server's `season_valid` check accepts. */
export function isSeason(v: unknown): v is Season {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  const o = v as Record<string, unknown>;
  return keys.length === 2 && isMonth(o.from) && isMonth(o.to);
}
