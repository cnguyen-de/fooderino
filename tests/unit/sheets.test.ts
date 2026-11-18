import { describe, expect, it } from 'vitest';
import type { RecipeId, RecipeRow } from '~~/types/cook';
import type { HouseholdId, Instant } from '~~/types/pantry';
import type { PendingSheet } from '~~/types/sync';
import { overlaySheets, stampAbove } from '~~/utils/sheets';

const HOME = '00000000-0000-4000-8000-000000000001' as HouseholdId;
const AWAY = '00000000-0000-4000-8000-000000000002' as HouseholdId;
const at = (hour: number) => `2026-11-18T${String(hour).padStart(2, '0')}:00:00.000Z` as Instant;

const row = (id: string, name: string, updated_at: Instant, household_id = HOME): RecipeRow => ({
  id: id as RecipeId, household_id, name, kind: 'dish', ingredients: [], instructions: '', deleted_at: null, updated_at, seq: 7
});
const sheet = (id: string, name: string, updated_at: Instant, household_id = HOME): PendingSheet<'recipes'> => {
  const { seq: _, ...rest } = row(id, name, updated_at, household_id);
  return { store: 'recipes', ...rest };
};

describe('overlaySheets', () => {
  it('shows a pending sheet over an older confirmed row, and as a new row when the server has none', () => {
    const { store: _a, ...edited } = sheet('a', 'Edited', at(10));
    const { store: _b, ...fresh } = sheet('b', 'New', at(10));
    const shown = overlaySheets([row('a', 'Old', at(9))], [sheet('a', 'Edited', at(10)), sheet('b', 'New', at(10))]);
    expect([...shown.values()]).toEqual([edited, fresh]);
  });

  it('hides a pending sheet once the server holds the row at least as new', () => {
    const shown = overlaySheets([row('a', 'Server', at(10))], [sheet('a', 'Lost', at(10))]);
    expect(shown.get('a' as RecipeId)?.name).toBe('Server');
  });

  it('never shows a sheet aimed at a row of another household', () => {
    const shown = overlaySheets([row('a', 'Ours', at(9))], [sheet('a', 'Theirs', at(10), AWAY)]);
    expect(shown.get('a' as RecipeId)?.name).toBe('Ours');
  });
});

describe('stampAbove', () => {
  it('uses the device clock when it is ahead of every known stamp', () => {
    expect(stampAbove(at(12), at(9), null, undefined)).toBe(at(12));
  });

  it('outranks the newest known stamp when the device clock runs behind', () => {
    expect(stampAbove(at(8), at(9), at(10))).toBe('2026-11-18T10:00:00.001Z');
  });
});
