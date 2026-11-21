import { describe, expect, it } from 'vitest';
import { addDays, DEFAULT_RULES, localDate, suggest } from '~~/utils/pantry';
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
  SuggestInput,
  SuggestRules
} from '~~/utils/pantry';

const today = localDate('2026-11-16');
/** Fixed here so the rule semantics are tested apart from the calibrated defaults. */
const rules: SuggestRules = { windowDays: 182, minPurchaseDays: 3, dueFraction: 0.8, useSoonDays: 3 };
const h1 = 'h1' as HouseholdId;

/** Local time on the day `offset` days from today, so day bucketing ignores the machine's zone. */
function on(offset: number, hour = 12): Instant {
  const [y, m, d] = addDays(today, offset).split('-').map(Number);
  return new Date(y!, m! - 1, d!, hour).toISOString() as Instant;
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
    amount: 0,
    to_buy: 0,
    best_before: null,
    merged_into: null,
    deleted_at: null,
    ...over
  };
}

let seq = 0;
function base(itemId: string, offset: number, hour?: number) {
  seq++;
  return {
    id: `e${seq}` as EventId,
    household_id: h1,
    item_id: itemId as ItemId,
    command_id: `c${seq}` as CommandId,
    occurred_at: on(offset, hour),
    actor: null,
    origin: 'live' as const
  };
}
const purchase = (id: string, offset: number, qty = 1, hour?: number): ItemEvent => ({
  ...base(id, offset, hour),
  kind: 'purchase',
  qty
});
const consume = (id: string, offset: number, qty: number, after: number): ItemEvent => ({
  ...base(id, offset),
  kind: 'consume',
  qty,
  after
});
const waste = (id: string, offset: number, qty: number, after: number): ItemEvent => ({
  ...base(id, offset),
  kind: 'waste',
  qty,
  after
});
const dismiss = (id: string, offset: number, hour?: number): ItemEvent => ({
  ...base(id, offset, hour),
  kind: 'dismiss'
});
const reverse = (target: ItemEvent, offset: number): ItemEvent => {
  const stock = { amount: 0, to_buy: 0, best_before: null };
  return { ...base(target.item_id, offset), kind: 'correction', before: stock, after: stock, reverses: target.id };
};
const bagEntry = (itemId: string, state: BagEntry['state']): BagEntry => {
  const common = {
    id: `b-${itemId}` as BagId,
    household_id: h1,
    item_id: itemId as ItemId,
    qty: 1,
    from_list: 0,
    bought_at: on(0),
    purchase_event: 'e0' as EventId
  };
  return state === 'open'
    ? { ...common, state, closed_by_command: null }
    : { ...common, state, closed_by_command: 'cx' as CommandId };
};

function run(input: Partial<SuggestInput>) {
  return suggest({ items: [], bag: [], events: [], today, rules, historyComplete: true, ...input });
}
const needIds = (input: Partial<SuggestInput>) => run(input).probablyNeed.map((s) => s.item.id);
const ranOutIds = (input: Partial<SuggestInput>) => run(input).ranOut.map((i) => i.id);

const everyTenDays = (id: string, last: number, qty = 1) => [-20, -10, 0].map((d) => purchase(id, last + d, qty));

describe('expanded suggestion defaults', () => {
  const events = [purchase('milk', -20, 2), purchase('milk', -10, 2)];
  it('suggests a repeat purchase after two distinct purchase days', () => {
    expect(run({ items: [item('milk', { amount: 1 })], events, rules: DEFAULT_RULES }).probablyNeed).toMatchObject([
      { item: { id: 'milk' }, qty: 2 }
    ]);
  });
  it('does not treat several purchases on one day as an established pattern', () => {
    expect(
      needIds({
        items: [item('milk')],
        events: [purchase('milk', -10, 1, 9), purchase('milk', -10, 1, 18)],
        rules: DEFAULT_RULES
      })
    ).toEqual([]);
  });
  it('still respects stock, shopping lists, bags and skipped suggestions', () => {
    const input = { events, rules: DEFAULT_RULES };
    expect(needIds({ ...input, items: [item('milk', { amount: 2 })] })).toEqual([]);
    expect(needIds({ ...input, items: [item('milk', { to_buy: 1 })] })).toEqual([]);
    expect(needIds({ ...input, items: [item('milk')], bag: [bagEntry('milk', 'open')] })).toEqual([]);
    expect(needIds({ ...input, items: [item('milk')], events: [...events, dismiss('milk', -1)] })).toEqual([]);
  });
});

describe('suggest: probably need', () => {
  it('is due once 80% of the median gap has passed since the last purchase', () => {
    const items = [item('milk')];
    expect(needIds({ items, events: everyTenDays('milk', -8) })).toEqual(['milk']);
    expect(needIds({ items, events: everyTenDays('milk', -7) })).toEqual([]);
  });

  it('suggests the median purchase quantity and holds back while stock covers it', () => {
    const events = everyTenDays('eggs', -10, 2);
    expect(run({ items: [item('eggs', { amount: 1 })], events }).probablyNeed).toMatchObject([
      { item: { id: 'eggs' }, qty: 2 }
    ]);
    expect(needIds({ items: [item('eggs', { amount: 2 })], events })).toEqual([]);
  });

  it('rounds a fractional median quantity down to a whole purchase', () => {
    // Median of 2, 2, 3, 3 is 2.5; nobody buys half an egg box.
    const events = [
      purchase('eggs', -40, 2),
      purchase('eggs', -30, 2),
      purchase('eggs', -20, 3),
      purchase('eggs', -10, 3)
    ];
    const need = (amount: number) => run({ items: [item('eggs', { amount })], events }).probablyNeed;
    expect(need(1)).toMatchObject([{ item: { id: 'eggs' }, qty: 2 }]);
    expect(need(2)).toMatchObject([{ item: { id: 'eggs' }, qty: 2 }]);
  });

  it('needs at least three purchase days', () => {
    expect(needIds({ items: [item('milk')], events: [purchase('milk', -20), purchase('milk', -10)] })).toEqual([]);
  });

  it('is held back while the item is on the list or in an open bag entry', () => {
    const events = everyTenDays('milk', -10);
    expect(needIds({ items: [item('milk', { to_buy: 1 })], events })).toEqual([]);
    expect(needIds({ items: [item('milk')], events, bag: [bagEntry('milk', 'open')] })).toEqual([]);
    expect(needIds({ items: [item('milk')], events, bag: [bagEntry('milk', 'unpacked')] })).toEqual(['milk']);
  });

  it('is snoozed by a dismiss for one cycle', () => {
    const items = [item('milk')];
    const history = everyTenDays('milk', -10);
    expect(needIds({ items, events: [...history, dismiss('milk', -5)] })).toEqual([]);
    expect(needIds({ items, events: [...history, dismiss('milk', -10, 18)] })).toEqual(['milk']);
  });

  it('ends the snooze when a new purchase comes after the dismiss', () => {
    const items = [item('milk')];
    const earlier = [purchase('milk', -28), purchase('milk', -18)];
    expect(needIds({ items, events: [...earlier, dismiss('milk', -7), purchase('milk', -8)] })).toEqual([]);
    expect(needIds({ items, events: [...earlier, dismiss('milk', -9), purchase('milk', -8)] })).toEqual(['milk']);
  });

  it('adds up purchases on the same day', () => {
    const items = [item('bread', { amount: 1 })];
    const sameDay = [
      purchase('bread', -30, 1),
      purchase('bread', -20, 2, 9),
      purchase('bread', -20, 2, 18),
      purchase('bread', -10, 4)
    ];
    expect(run({ items, events: sameDay }).probablyNeed).toMatchObject([{ item: { id: 'bread' }, qty: 4 }]);

    const twoDays = [purchase('bread', -20, 1, 9), purchase('bread', -20, 1, 18), purchase('bread', -10)];
    expect(needIds({ items: [item('bread')], events: twoDays })).toEqual([]);
  });

  it('ignores reversed purchases and purchases outside the window', () => {
    const items = [item('milk')];
    const history = everyTenDays('milk', -10);
    expect(needIds({ items, events: [...history, reverse(history[2]!, -10)] })).toEqual([]);
    const old = [purchase('milk', -200), purchase('milk', -190), purchase('milk', -10)];
    expect(needIds({ items, events: old })).toEqual([]);
  });

  it('never counts waste as a purchase', () => {
    const items = [item('milk')];
    const wasted = [waste('milk', -30, 1, 0), waste('milk', -20, 1, 0), waste('milk', -10, 1, 0)];
    expect(needIds({ items, events: wasted })).toEqual([]);
    const history = everyTenDays('milk', -7);
    expect(needIds({ items, events: [...history, ...wasted] })).toEqual([]);
  });

  it('credits purchases on a merged item to the item it merged into', () => {
    const items = [item('semi', { merged_into: 'milk' as ItemId }), item('milk')];
    const events = [purchase('semi', -30), purchase('semi', -20), purchase('milk', -10)];
    expect(needIds({ items, events })).toEqual(['milk']);
  });

  it('returns no buy suggestions until history is complete', () => {
    const items = [item('milk'), item('eggs', { amount: 1, best_before: today })];
    const events = [...everyTenDays('milk', -10), consume('milk', -1, 1, 0)];
    const result = run({ items, events, historyComplete: false });
    expect(result.probablyNeed).toEqual([]);
    expect(result.ranOut).toEqual([]);
    expect(result.useSoon.map((u) => u.item.id)).toEqual(['eggs']);
  });
});

describe('suggest: ran out', () => {
  it('lists an item without cadence that a use took from positive to zero', () => {
    expect(ranOutIds({ items: [item('cumin')], events: [consume('cumin', -2, 1, 0)] })).toEqual(['cumin']);
    expect(ranOutIds({ items: [item('cumin')], events: [waste('cumin', -2, 1, 0)] })).toEqual(['cumin']);
  });

  it('needs a positive-to-zero use, not a correction to zero', () => {
    const toZero: ItemEvent = {
      ...base('cumin', -1),
      kind: 'correction',
      before: { amount: 1, to_buy: 0, best_before: null },
      after: { amount: 0, to_buy: 0, best_before: null },
      reverses: null
    };
    expect(ranOutIds({ items: [item('cumin')], events: [consume('cumin', -2, 1, 1), toZero] })).toEqual([]);
  });

  it('is cleared by a later dismiss and held back by the list or the bag', () => {
    const events = [consume('cumin', -2, 1, 0)];
    expect(ranOutIds({ items: [item('cumin')], events: [...events, dismiss('cumin', -1)] })).toEqual([]);
    expect(ranOutIds({ items: [item('cumin', { to_buy: 1 })], events })).toEqual([]);
    expect(ranOutIds({ items: [item('cumin')], events, bag: [bagEntry('cumin', 'open')] })).toEqual([]);
  });

  it('skips items with a cadence and items in stock', () => {
    const cadence = [...everyTenDays('milk', -5), consume('milk', -1, 1, 0)];
    expect(ranOutIds({ items: [item('milk')], events: cadence })).toEqual([]);
    expect(ranOutIds({ items: [item('cumin', { amount: 1 })], events: [consume('cumin', -2, 1, 0)] })).toEqual([]);
  });

  it('ignores an undone use', () => {
    const used = consume('cumin', -2, 1, 0);
    expect(ranOutIds({ items: [item('cumin')], events: [used, reverse(used, -2)] })).toEqual([]);
  });
});

describe('suggest: use soon', () => {
  it('lists in-stock items up to the horizon, overdue included, soonest first', () => {
    const items = [
      item('in3', { amount: 1, best_before: addDays(today, 3) }),
      item('in4', { amount: 1, best_before: addDays(today, 4) }),
      item('overdue', { amount: 1, best_before: addDays(today, -2) }),
      item('today', { amount: 1, best_before: today }),
      item('empty', { amount: 0, best_before: today }),
      item('undated', { amount: 1 })
    ];
    expect(run({ items }).useSoon.map((u) => [u.item.id, u.days_left])).toEqual([
      ['overdue', -2],
      ['today', 0],
      ['in3', 3]
    ]);
  });
});
