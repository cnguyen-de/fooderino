import { describe, expect, it } from 'vitest';
import { parseItem, WireError } from '~~/utils/sync-wire';

const row = (over: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-0000000000aa',
  household_id: '00000000-0000-4000-8000-000000000001',
  name: 'Kale',
  aliases: [],
  tags: [],
  unit: 'count',
  default_amount: 1,
  shelf_life_days: null,
  season: null,
  amount: 0,
  to_buy: 0,
  best_before: null,
  merged_into: null,
  deleted_at: null,
  updated_at: '2026-11-01T00:00:00Z',
  seq: 1,
  ...over
});

describe('parseItem: season', () => {
  it('reads a season, including one that runs past December', () => {
    expect(parseItem(row({ season: { from: 11, to: 2 } })).season).toEqual({ from: 11, to: 2 });
    expect(parseItem(row({ season: { from: 7, to: 7 } })).season).toEqual({ from: 7, to: 7 });
  });

  it('reads null, and a row from before seasons existed, as no season', () => {
    expect(parseItem(row({ season: null })).season).toBeNull();
    const { season: _, ...legacy } = row();
    expect(parseItem(legacy).season).toBeNull();
  });

  it.each([
    ['a month of 0', { from: 0, to: 2 }],
    ['a month of 13', { from: 1, to: 13 }],
    ['a fractional month', { from: 1.5, to: 3 }],
    ['a month as text', { from: '1', to: 3 }],
    ['a missing end', { from: 1 }],
    ['an extra key', { from: 1, to: 3, note: 'x' }],
    ['an array', [1, 3]]
  ])('refuses %s', (_, season) => {
    expect(() => parseItem(row({ season }))).toThrow(WireError);
  });
});
