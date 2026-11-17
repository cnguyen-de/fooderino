import type { BagEntry, EventId, Instant, Item, ItemEvent, ItemId, LocalDate } from '~~/types/pantry';
import { addDays, daysBetween, localDateOf } from './dates';
import { isLive, resolveItem } from './merge';

export interface SuggestRules {
  /** Only purchases and uses this many days back count. */
  windowDays: number;
  /** Distinct purchase days needed before an item has a cadence. */
  minPurchaseDays: number;
  /** Due once this fraction of the median gap has passed since the last purchase. */
  dueFraction: number;
  /** Use soon covers best-before dates up to this many days ahead. */
  useSoonDays: number;
}

/** Tuned on the legacy log export by `scripts/calibrate-suggestions.ts`; see docs/superpowers/specs/2026-11-16-suggestion-calibration.md. */
export const DEFAULT_RULES: Readonly<SuggestRules> = Object.freeze({
  windowDays: 365,
  minPurchaseDays: 2,
  dueFraction: 0.6,
  useSoonDays: 3
});

export interface SuggestInput {
  /** Every item of the household, merged ones included, so events on them resolve. */
  items: readonly Item[];
  bag: readonly BagEntry[];
  events: readonly ItemEvent[];
  today: LocalDate;
  rules: SuggestRules;
  /** False until first hydration finishes; buy suggestions stay empty until then. */
  historyComplete: boolean;
}

export interface Suggestions {
  probablyNeed: { item: Item; qty: number }[];
  ranOut: Item[];
  useSoon: { item: Item; best_before: LocalDate; days_left: number }[];
}

interface History {
  purchases: Map<LocalDate, number>;
  lastPurchaseAt: number;
  lastEmptiedAt: number;
  lastDismissAt: number;
  lastDismissDay: LocalDate | null;
  uses: number;
}

const at = (instant: Instant) => Date.parse(instant);
const byName = (a: Item, b: Item) => a.name.localeCompare(b.name);

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Per live item, its non-reversed history, with events on merged items credited to what they merged into. */
function histories(items: readonly Item[], events: readonly ItemEvent[], today: LocalDate, rules: SuggestRules) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const reversed = new Set<EventId>();
  for (const e of events) if (e.kind === 'correction' && e.reverses) reversed.add(e.reverses);
  const inWindow = (e: ItemEvent) => daysBetween(localDateOf(e.occurred_at), today) < rules.windowDays;

  const out = new Map<ItemId, History>();
  for (const e of events) {
    const item = resolveItem(byId, e.item_id);
    if (!item || reversed.has(e.id)) continue;
    let h = out.get(item.id);
    if (!h) {
      h = {
        purchases: new Map(),
        lastPurchaseAt: -Infinity,
        lastEmptiedAt: -Infinity,
        lastDismissAt: -Infinity,
        lastDismissDay: null,
        uses: 0
      };
      out.set(item.id, h);
    }
    if (e.kind === 'purchase' && inWindow(e)) {
      const day = localDateOf(e.occurred_at);
      h.purchases.set(day, (h.purchases.get(day) ?? 0) + e.qty);
      h.lastPurchaseAt = Math.max(h.lastPurchaseAt, at(e.occurred_at));
    } else if (e.kind === 'consume' || e.kind === 'waste') {
      if (e.after === 0 && e.qty > 0) h.lastEmptiedAt = Math.max(h.lastEmptiedAt, at(e.occurred_at));
      if (e.kind === 'consume' && inWindow(e)) h.uses++;
    } else if (e.kind === 'dismiss' && at(e.occurred_at) > h.lastDismissAt) {
      h.lastDismissAt = at(e.occurred_at);
      h.lastDismissDay = localDateOf(e.occurred_at);
    }
  }
  return out;
}

/** Consume events per live item in the window. Waste never counts. */
export function useCounts(items: readonly Item[], events: readonly ItemEvent[], today: LocalDate, rules: SuggestRules) {
  const counts = new Map<ItemId, number>();
  for (const [id, h] of histories(items, events, today, rules)) counts.set(id, h.uses);
  return counts;
}

function cadenceOf(h: History | undefined, rules: SuggestRules) {
  if (!h || h.purchases.size < rules.minPurchaseDays) return null;
  const days = [...h.purchases.keys()].sort();
  const gaps = days.slice(1).map((day, i) => daysBetween(days[i]!, day));
  return { gap: median(gaps), qty: median([...h.purchases.values()]), last: days[days.length - 1]! };
}

export function suggest({ items, bag, events, today, rules, historyComplete }: SuggestInput): Suggestions {
  const live = items.filter(isLive).sort(byName);
  const horizon = addDays(today, rules.useSoonDays);
  const useSoon = live
    .flatMap((item) =>
      item.amount > 0 && item.best_before !== null && item.best_before <= horizon
        ? [{ item, best_before: item.best_before, days_left: daysBetween(today, item.best_before) }]
        : []
    )
    .sort((a, b) => a.days_left - b.days_left);
  if (!historyComplete) return { probablyNeed: [], ranOut: [], useSoon };

  const byId = new Map(items.map((i) => [i.id, i]));
  const inBag = new Set(bag.filter((b) => b.state === 'open').flatMap((b) => resolveItem(byId, b.item_id)?.id ?? []));
  const history = histories(items, events, today, rules);
  const probablyNeed: Suggestions['probablyNeed'] = [];
  const ranOut: Item[] = [];

  for (const item of live) {
    if (item.to_buy > 0 || inBag.has(item.id)) continue;
    const h = history.get(item.id);
    const cadence = cadenceOf(h, rules);
    if (h && cadence) {
      const due = daysBetween(cadence.last, today) >= Math.ceil(rules.dueFraction * cadence.gap);
      const snoozed =
        h.lastDismissDay !== null &&
        h.lastDismissAt > h.lastPurchaseAt &&
        daysBetween(h.lastDismissDay, today) < cadence.gap;
      // The median can land between purchases (2, 3 → 2.5); suggest a whole amount, rounded down.
      if (due && !snoozed && item.amount < cadence.qty)
        probablyNeed.push({ item, qty: Math.max(1, Math.floor(cadence.qty)) });
    } else if (h && item.amount === 0 && h.lastEmptiedAt > h.lastDismissAt) {
      ranOut.push(item);
    }
  }
  return { probablyNeed, ranOut, useSoon };
}
