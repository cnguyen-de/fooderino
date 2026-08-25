import { describe, it, expect } from 'vitest';
import { SYNC_TABLES, defFor, tableFor } from '~~/utils/sync-registry';

describe('sync registry', () => {
  it('maps every local store to its v2 remote table', () => {
    expect(defFor('lists').remote).toBe('lists_v2');
    expect(defFor('items').remote).toBe('items_v2');
    expect(defFor('logs').remote).toBe('logs_v2');
    expect(defFor('recipes').remote).toBe('recipes_v2');
    expect(defFor('list_members').remote).toBe('list_members');
    expect(defFor('user_settings').remote).toBe('user_settings');
  });

  it('omits the trigger-owned counter columns from item pushes', () => {
    expect(defFor('items').pushOmit).toEqual(['amount', 'amount_to_purchase']);
  });

  it('omits nothing from tables without trigger-owned columns', () => {
    expect(defFor('lists').pushOmit).toEqual([]);
  });

  it('uses created_at as the cursor for the append-only log table', () => {
    expect(defFor('logs').cursor).toBe('created_at');
    expect(defFor('logs').appendOnly).toBe(true);
  });

  it('uses updated_at for every LWW table', () => {
    for (const def of SYNC_TABLES.filter((d) => !d.appendOnly)) {
      expect(def.cursor).toBe('updated_at');
    }
  });

  it('resolves a Dexie handle for every registered table', () => {
    for (const def of SYNC_TABLES) {
      expect(tableFor(def.local).name).toBe(def.local);
    }
  });

  it('pushes lists before items, so an item never references a missing list', () => {
    const names = SYNC_TABLES.map((d) => d.local);
    expect(names.indexOf('lists')).toBeLessThan(names.indexOf('items'));
    expect(names.indexOf('lists')).toBeLessThan(names.indexOf('list_members'));
  });
});
