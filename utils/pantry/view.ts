import type {
  BagLine,
  Item,
  ItemEvent,
  ItemGroup,
  ItemId,
  LocalDate,
  PantryItem,
  PantryView,
  Snapshot,
  TagKind
} from '~~/types/pantry';
import { normName } from './ids';
import { isLive, resolveItem } from './merge';
import { suggest, useCounts, type SuggestRules } from './suggest';

export interface PantryViewInput {
  snapshot: Snapshot;
  events: readonly ItemEvent[];
  today: LocalDate;
  rules: SuggestRules;
  historyComplete: boolean;
}

const MOST_USED_LIMIT = 10;

function toPantryItem(item: Item): PantryItem {
  const { id, name, aliases, tags, unit, default_amount, shelf_life_days, amount, to_buy, best_before } = item;
  return { id, name, aliases, tags, unit, default_amount, shelf_life_days, amount, to_buy, best_before };
}

const byName = (a: PantryItem, b: PantryItem) => a.name.localeCompare(b.name);

/** Groups by each item's first tag of `kind`; items without one go in the Unsorted group, which comes last. */
function groupBy(items: readonly PantryItem[], kind: TagKind, order: (a: PantryItem, b: PantryItem) => number) {
  const groups = new Map<string | null, ItemGroup>();
  for (const item of items) {
    const tag = item.tags.find((t) => t.kind === kind);
    const key = tag ? normName(tag.name) : null;
    const group = groups.get(key) ?? { name: tag?.name ?? null, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => (a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name)))
    .map((g) => ({ ...g, items: g.items.sort(order) }));
}

export function buildPantryView({ snapshot, events, today, rules, historyComplete }: PantryViewInput): PantryView {
  const all = [...snapshot.items.values()];
  const pantry = new Map<ItemId, PantryItem>();
  for (const item of all) if (isLive(item)) pantry.set(item.id, toPantryItem(item));
  const project = (item: Item) => pantry.get(item.id) ?? toPantryItem(item);
  const live = [...pantry.values()];

  const bag = [...snapshot.bag.values()];
  const s = suggest({ items: all, bag, events, today, rules, historyComplete });
  const uses = useCounts(all, events, today, rules);
  const useCount = (item: PantryItem) => uses.get(item.id) ?? 0;
  const byUse = (a: PantryItem, b: PantryItem) => useCount(b) - useCount(a) || byName(a, b);

  const useSoon = s.useSoon.map((u) => ({ ...u, item: project(u.item) }));
  const soon = new Set(useSoon.map((u) => u.item.id));
  const inStock = live.filter((i) => i.amount > 0);

  const bagLines: BagLine[] = bag
    .flatMap((entry) => {
      const item = entry.state === 'open' ? resolveItem(snapshot.items, entry.item_id) : undefined;
      if (!item) return [];
      const { id, qty, from_list, bought_at } = entry;
      return [{ id, item: project(item), qty, from_list, bought_at }];
    })
    .sort((a, b) => a.bought_at.localeCompare(b.bought_at));

  return {
    home: {
      useSoon,
      mostUsed: inStock
        .filter((i) => !soon.has(i.id) && useCount(i) > 0)
        .sort(byUse)
        .slice(0, MOST_USED_LIMIT),
      byPlace: groupBy(inStock, 'place', byUse)
    },
    shopping: {
      byStore: groupBy(
        live.filter((i) => i.to_buy > 0),
        'store',
        byName
      ),
      probablyNeed: s.probablyNeed.map((p) => ({ item: project(p.item), qty: p.qty })),
      ranOut: s.ranOut.map(project),
      bag: bagLines
    },
    byId(id) {
      const item = resolveItem(snapshot.items, id);
      return item && project(item);
    },
    history(id) {
      const root = resolveItem(snapshot.items, id);
      if (!root) return [];
      return events
        .filter((e) => resolveItem(snapshot.items, e.item_id)?.id === root.id)
        .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
    }
  };
}
