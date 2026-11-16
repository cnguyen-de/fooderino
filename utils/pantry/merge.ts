import type { Item, ItemId, LocalDate } from '~~/types/pantry';
import { minDate } from './dates';
import { normName, normalizeAliases, normalizeTags } from './ids';

export function isLive(item: Item): boolean {
  return item.merged_into === null && item.deleted_at === null;
}

/** Follows `merged_into` to the live item an id now stands for. */
export function resolveItem(items: ReadonlyMap<ItemId, Item>, id: ItemId): Item | undefined {
  let item = items.get(id);
  for (let hops = 0; item?.merged_into && hops < items.size; hops++) item = items.get(item.merged_into);
  return item && isLive(item) ? item : undefined;
}

/** An empty side's date belongs to stock that is gone, so it only counts when both sides are empty. */
function combinedExpiry(a: Item, b: Item): LocalDate | null {
  if (a.amount > 0 && b.amount === 0) return a.best_before;
  if (b.amount > 0 && a.amount === 0) return b.best_before;
  return minDate(a.best_before, b.best_before);
}

/** `into` after taking in `src`: counts add, tags and aliases union, soonest expiry, src name kept as an alias. */
export function absorb(into: Item, src: Item): Item {
  return {
    ...into,
    amount: into.amount + src.amount,
    to_buy: into.to_buy + src.to_buy,
    best_before: combinedExpiry(into, src),
    aliases: normalizeAliases(into.name, [...into.aliases, src.name, ...src.aliases]),
    tags: normalizeTags([...into.tags, ...src.tags])
  };
}

export interface MergePlan {
  merged: { into: ItemId; sources: ItemId[]; result: Item }[];
  added: ItemId[];
  ambiguous: { source: ItemId; candidates: ItemId[]; reason: 'several_matches' | 'unit_differs' }[];
}

function keysOf(item: Item): string[] {
  return [item.name, ...item.aliases].map(normName);
}

/** Preview of the join and pick merge. The server's `plan_merge` decides. */
export function planHouseholdMerge(sources: readonly Item[], target: readonly Item[]): MergePlan {
  const byKey = new Map<string, Set<Item>>();
  for (const item of target.filter(isLive)) {
    for (const key of keysOf(item)) byKey.set(key, (byKey.get(key) ?? new Set()).add(item));
  }

  const merged = new Map<ItemId, MergePlan['merged'][number]>();
  const plan: MergePlan = { merged: [], added: [], ambiguous: [] };
  for (const src of sources.filter(isLive)) {
    const candidates = new Set(keysOf(src).flatMap((key) => [...(byKey.get(key) ?? [])]));
    const [only, ...rest] = candidates;
    if (!only) {
      plan.added.push(src.id);
    } else if (rest.length > 0) {
      plan.ambiguous.push({ source: src.id, candidates: [...candidates].map((c) => c.id), reason: 'several_matches' });
    } else if (only.unit !== src.unit) {
      plan.ambiguous.push({ source: src.id, candidates: [only.id], reason: 'unit_differs' });
    } else {
      const line = merged.get(only.id) ?? { into: only.id, sources: [], result: only };
      line.sources.push(src.id);
      line.result = absorb(line.result, src);
      merged.set(only.id, line);
    }
  }
  plan.merged = [...merged.values()];
  return plan;
}
