import { describe, it, expect } from 'vitest';
import { buildExportPayload, isValidPayload, planImport, EXPORT_VERSION, type ExportPayload } from '~~/utils/export';
import type { ItemRecord, ListRecord, RecipeRecord } from '~~/types/sync';

const ME = 'user-me';
const NOW = '2026-11-16T12:00:00.000Z';
const OLD = '2026-01-01T00:00:00.000Z';

const list = (id: string, owner = ME): ListRecord => ({ id, name: 'Groceries', owner, updated_at: OLD, deleted_at: null });
const item = (id: string, over: Partial<ItemRecord> = {}): ItemRecord => ({
  id,
  list_id: 'l1',
  name: 'milk',
  location: '',
  store: '',
  amount: 0,
  amount_to_purchase: 0,
  amount_type: 'count',
  default_amount: 1,
  created_by: null,
  updated_at: OLD,
  deleted_at: null,
  ...over
});
const recipe = (id: string, user_id = ME): RecipeRecord => ({
  id,
  user_id,
  name: 'Soup',
  description: null,
  ingredients: [],
  instructions: null,
  saved: true,
  updated_at: OLD,
  deleted_at: null
});

const payload = (over: Partial<ExportPayload> = {}): ExportPayload => ({
  version: EXPORT_VERSION,
  lists: [],
  items: [],
  recipes: [],
  ...over
});

const ctx = (over: Partial<Parameters<typeof planImport>[1]> = {}) => ({
  userId: ME,
  now: NOW,
  existing: { lists: new Set<string>(), items: new Set<string>(), recipes: new Set<string>() },
  liveListIds: new Set<string>(),
  ...over
});

const count = (plan: ReturnType<typeof planImport>, label: string) => plan.summary.find((s) => s.label === label)!;

describe('buildExportPayload', () => {
  it('stamps the version and carries every collection', () => {
    const p = buildExportPayload([list('l1')], [item('i1')], []);
    expect(p.version).toBe(EXPORT_VERSION);
    expect(p.lists).toHaveLength(1);
    expect(p.items).toHaveLength(1);
    expect(p.recipes).toEqual([]);
  });

  it('drops tombstoned rows, so an export is a clean snapshot', () => {
    const dead = item('i2', { deleted_at: '2026-01-02T00:00:00.000Z' });
    const p = buildExportPayload([list('l1')], [item('i1'), dead], []);
    expect(p.items.map((i) => i.id)).toEqual(['i1']);
  });
});

describe('isValidPayload', () => {
  it('accepts a well-formed payload', () => {
    expect(isValidPayload({ version: 1, lists: [], items: [], recipes: [] })).toBe(true);
  });

  it('rejects a non-object', () => {
    expect(isValidPayload('nope')).toBe(false);
    expect(isValidPayload(null)).toBe(false);
  });

  it('rejects a payload missing a collection', () => {
    expect(isValidPayload({ version: 1, lists: [], items: [] })).toBe(false);
  });

  it('rejects a payload with no version', () => {
    expect(isValidPayload({ lists: [], items: [], recipes: [] })).toBe(false);
  });

  it('rejects a version newer than this build understands', () => {
    expect(isValidPayload({ version: EXPORT_VERSION + 1, lists: [], items: [], recipes: [] })).toBe(
      false
    );
  });

  it('rejects rows without a string id', () => {
    expect(isValidPayload({ version: 1, lists: [{ name: 'x' }], items: [], recipes: [] })).toBe(false);
    expect(isValidPayload({ version: 1, lists: [null], items: [], recipes: [] })).toBe(false);
  });
});

describe('planImport', () => {
  it('adds what is new and skips what is already here', () => {
    const plan = planImport(
      payload({ lists: [list('l1'), list('l2')], items: [item('i1', { list_id: 'l2' })] }),
      ctx({ existing: { ...ctx().existing, lists: new Set(['l1']) } })
    );
    expect(plan.lists.map((l) => l.id)).toEqual(['l2']);
    expect(count(plan, 'lists')).toMatchObject({ total: 2, newCount: 1, skipCount: 1 });
    expect(count(plan, 'items')).toMatchObject({ total: 1, newCount: 1, skipCount: 0 });
  });

  it('reports everything as skipped on a second import of the same file', () => {
    const plan = planImport(
      payload({ lists: [list('l1')] }),
      ctx({ existing: { ...ctx().existing, lists: new Set(['l1']) } })
    );
    expect(plan.lists).toEqual([]);
    expect(count(plan, 'lists')).toMatchObject({ newCount: 0, skipCount: 1 });
  });

  it('restamps updated_at so the push sweep picks imported rows up', () => {
    const plan = planImport(payload({ lists: [list('l1')], recipes: [recipe('r1')] }), ctx());
    expect(plan.lists[0]!.updated_at).toBe(NOW);
    expect(plan.recipes[0]!.updated_at).toBe(NOW);
  });

  it('zeroes item counters and returns them as set ops, since pushes omit them', () => {
    const plan = planImport(
      payload({ lists: [list('l1')], items: [item('i1', { amount: 3, amount_to_purchase: 2 }), item('i2')] }),
      ctx()
    );
    expect(plan.items.find((i) => i.id === 'i1')).toMatchObject({ amount: 0, amount_to_purchase: 0 });
    expect(plan.counters).toEqual([
      { item_id: 'i1', field: 'amount', value: 3 },
      { item_id: 'i1', field: 'amount_to_purchase', value: 2 }
    ]);
  });

  it('skips items whose list is neither here nor being imported', () => {
    const plan = planImport(payload({ items: [item('i1', { list_id: 'gone' })] }), ctx());
    expect(plan.items).toEqual([]);
    expect(count(plan, 'items')).toMatchObject({ newCount: 0, skipCount: 1 });
  });

  it('imports items into a list that already lives on this device', () => {
    const plan = planImport(payload({ items: [item('i1', { list_id: 'l9' })] }), ctx({ liveListIds: new Set(['l9']) }));
    expect(plan.items.map((i) => i.id)).toEqual(['i1']);
  });

  it("skips lists and recipes belonging to another account, which RLS would reject", () => {
    const plan = planImport(
      payload({
        lists: [list('l1', 'someone-else')],
        items: [item('i1', { list_id: 'l1' })],
        recipes: [recipe('r1', 'someone-else')]
      }),
      ctx()
    );
    expect(plan.lists).toEqual([]);
    expect(plan.items).toEqual([]);
    expect(plan.recipes).toEqual([]);
  });
});
