import { describe, expect, it } from 'vitest';
import { addDays, buildPantryView, localDate } from '~~/utils/pantry';
import type { SuggestRules } from '~~/utils/pantry';

const rules: SuggestRules = { windowDays: 182, minPurchaseDays: 3, dueFraction: 0.8, useSoonDays: 3 };
import type {
  BagEntry,
  BagId,
  CommandId,
  EventId,
  HouseholdId,
  Instant,
  Item,
  ItemEvent,
  ItemId,
  ItemRow,
  PantryViewInput,
  Tag
} from '~~/utils/pantry';

const today = localDate('2026-11-16');
const h1 = 'h1' as HouseholdId;
const place = (name: string): Tag => ({ kind: 'place', name });
const store = (name: string): Tag => ({ kind: 'store', name });

function on(offset: number): Instant {
  const [y, m, d] = addDays(today, offset).split('-').map(Number);
  return new Date(y!, m! - 1, d!, 12).toISOString() as Instant;
}

function item(id: string, over: Partial<Item> = {}): Item {
  return {
    id: id as ItemId,
    household_id: h1,
    name: id,
    aliases: [],
    tags: [],
    unit: 'count',
    default_amount: 1,
    shelf_life_days: null, season: null,
    amount: 1,
    to_buy: 0,
    best_before: null,
    merged_into: null,
    deleted_at: null,
    ...over
  };
}

let seq = 0;
function use(itemId: string, offset: number, kind: 'consume' | 'waste' = 'consume', after = 1): ItemEvent {
  seq++;
  return {
    id: `e${seq}` as EventId,
    household_id: h1,
    item_id: itemId as ItemId,
    command_id: `c${seq}` as CommandId,
    occurred_at: on(offset),
    actor: null,
    origin: 'live',
    kind,
    qty: 1,
    after
  };
}
function uses(itemId: string, count: number, offset = -1): ItemEvent[] {
  return Array.from({ length: count }, () => use(itemId, offset));
}
function undo(target: ItemEvent): ItemEvent {
  const stock = { amount: 1, to_buy: 0, best_before: null };
  return {
    ...target,
    id: `u-${target.id}` as EventId,
    kind: 'correction',
    before: stock,
    after: stock,
    reverses: target.id
  };
}

function openBag(id: string, itemId: string, offset: number): BagEntry {
  return {
    id: id as BagId,
    household_id: h1,
    item_id: itemId as ItemId,
    qty: 2,
    from_list: 1,
    bought_at: on(offset),
    purchase_event: 'e0' as EventId,
    state: 'open',
    closed_by_command: null
  };
}

function view(items: Item[], over: Partial<PantryViewInput> & { bag?: BagEntry[] } = {}) {
  const { bag = [], ...rest } = over;
  return buildPantryView({
    snapshot: {
      items: new Map(items.map((i) => [i.id, i])),
      bag: new Map(bag.map((b) => [b.id, b])),
      log: new Map()
    },
    events: [],
    today,
    rules,
    historyComplete: true,
    ...rest
  });
}
const groups = (gs: { name: string | null; items: { id: string }[] }[]) =>
  gs.map((g) => [g.name, g.items.map((i) => i.id)]);

describe('buildPantryView: home', () => {
  it('groups in-stock items under their first place tag, with untagged items in a last Unsorted group', () => {
    const v = view([
      item('milk', { tags: [store('Lidl'), place('Fridge'), place('Door')] }),
      item('rice', { tags: [place('Pantry')] }),
      item('soap', { tags: [store('Lidl')] }),
      item('salt'),
      item('butter', { tags: [place('fridge')] }),
      item('empty', { amount: 0, tags: [place('Fridge')] })
    ]);
    expect(groups(v.home.byPlace)).toEqual([
      ['Fridge', ['butter', 'milk']],
      ['Pantry', ['rice']],
      [null, ['salt', 'soap']]
    ]);
  });

  it('orders items within a place by use count, then name', () => {
    const items = [
      item('b', { tags: [place('Fridge')] }),
      item('a', { tags: [place('Fridge')] }),
      item('c', { tags: [place('Fridge')] })
    ];
    const v = view(items, { events: [...uses('c', 3), ...uses('b', 1)] });
    expect(groups(v.home.byPlace)).toEqual([['Fridge', ['c', 'b', 'a']]]);
  });

  it('ranks most used by consume count in the window, with name as the tiebreak', () => {
    const items = ['a', 'b', 'c', 'd'].map((id) => item(id));
    const events = [...uses('c', 3), ...uses('b', 2), ...uses('a', 2), ...uses('d', 5, -200)];
    expect(view(items, { events }).home.mostUsed.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('counts neither waste nor undone uses toward most used', () => {
    const items = [item('a'), item('b')];
    const undone = uses('a', 3);
    const events = [
      ...undone,
      ...undone.map(undo),
      ...Array.from({ length: 4 }, () => use('b', -1, 'waste')),
      use('b', -1)
    ];
    expect(view(items, { events }).home.mostUsed.map((i) => i.id)).toEqual(['b']);
  });

  it('keeps most used to ten in-stock items that are not already in use soon', () => {
    const items = Array.from({ length: 12 }, (_, n) => item(`i${String(n).padStart(2, '0')}`));
    items.push(item('soon', { best_before: today }), item('out', { amount: 0 }));
    const events = [...items.flatMap((i) => uses(i.id, 1)), ...uses('soon', 9), ...uses('out', 9)];
    const v = view(items, { events });
    expect(v.home.useSoon.map((u) => u.item.id)).toEqual(['soon']);
    expect(v.home.mostUsed.map((i) => i.id)).toEqual(items.slice(0, 10).map((i) => i.id));
  });

  it('credits uses of a merged item to the item it merged into', () => {
    const items = [item('semi', { merged_into: 'milk' as ItemId, amount: 0 }), item('milk'), item('eggs')];
    const v = view(items, { events: [...uses('semi', 2), ...uses('eggs', 1)] });
    expect(v.home.mostUsed.map((i) => i.id)).toEqual(['milk', 'eggs']);
  });
});

describe('buildPantryView: shopping', () => {
  it('groups listed items by their first store tag, never by place', () => {
    const v = view([
      item('milk', { to_buy: 1, tags: [place('Fridge'), store('Lidl')] }),
      item('chili', { to_buy: 2, tags: [store('Asian market'), store('Lidl')] }),
      item('salt', { to_buy: 1, tags: [place('Pantry')] }),
      item('rice', { to_buy: 0, tags: [store('Lidl')] })
    ]);
    expect(groups(v.shopping.byStore)).toEqual([
      ['Asian market', ['chili']],
      ['Lidl', ['milk']],
      [null, ['salt']]
    ]);
  });

  it('lists open bag entries against the item they now belong to, oldest first', () => {
    const closed: BagEntry = { ...openBag('b3', 'milk', -1), state: 'unpacked', closed_by_command: 'cx' as CommandId };
    const v = view([item('semi', { merged_into: 'milk' as ItemId }), item('milk')], {
      bag: [openBag('b2', 'milk', 0), openBag('b1', 'semi', -1), closed]
    });
    expect(v.shopping.bag.map((l) => [l.id, l.item.id, l.qty, l.from_list])).toEqual([
      ['b1', 'milk', 2, 1],
      ['b2', 'milk', 2, 1]
    ]);
  });

  it('carries probably need and ran out suggestions as pantry items', () => {
    const purchase = (offset: number): ItemEvent => ({ ...use('milk', offset), kind: 'purchase', qty: 2 });
    const v = view([item('milk', { amount: 0 }), item('cumin', { amount: 0 })], {
      events: [purchase(-30), purchase(-20), purchase(-10), use('cumin', -1, 'consume', 0)]
    });
    expect(v.shopping.probablyNeed).toEqual([{ item: v.byId('milk' as ItemId), qty: 2 }]);
    expect(v.shopping.ranOut).toEqual([v.byId('cumin' as ItemId)]);
  });
});

describe('buildPantryView: lookups', () => {
  it('exposes domain fields only, never sync columns', () => {
    const row: ItemRow = { ...item('milk'), seq: 42, updated_at: on(0) };
    expect(Object.keys(view([row]).byId(row.id) ?? {}).sort()).toEqual(
      [
        'aliases',
        'amount',
        'best_before',
        'default_amount',
        'id',
        'name',
        'season',
        'shelf_life_days',
        'tags',
        'to_buy',
        'unit'
      ].sort()
    );
  });

  it('resolves merged ids and hides deleted items', () => {
    const v = view([
      item('semi', { merged_into: 'milk' as ItemId }),
      item('milk'),
      item('gone', { deleted_at: on(-1) })
    ]);
    expect(v.byId('semi' as ItemId)?.id).toBe('milk');
    expect(v.byId('gone' as ItemId)).toBeUndefined();
  });

  it('returns an item history newest first, including events on items merged into it', () => {
    const older = use('semi', -3);
    const newer = use('milk', -1);
    const other = use('eggs', -2);
    const v = view([item('semi', { merged_into: 'milk' as ItemId }), item('milk'), item('eggs')], {
      events: [older, other, newer]
    });
    expect(v.history('milk' as ItemId)).toEqual([newer, older]);
  });
});
