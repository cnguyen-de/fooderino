import type { BagId, CommandId, EventId, HouseholdId, ItemId, Tag } from '~~/types/pantry';

export function newId<T extends ItemId | HouseholdId | BagId | CommandId | EventId>(): T {
  return crypto.randomUUID() as T;
}

/** The comparison key for names, aliases and tags: case, spacing and diacritics folded. */
export function normName(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function tidy(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/** Drops blank tags and keeps the first of each (kind, normalized name). */
export function normalizeTags(tags: readonly Tag[]): Tag[] {
  const seen = new Set<string>();
  const out: Tag[] = [];
  for (const tag of tags) {
    const name = tidy(tag.name);
    const key = `${tag.kind}:${normName(name)}`;
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: tag.kind, name });
  }
  return out;
}

/** Drops blank aliases, duplicates, and any alias equal to the name. */
export function normalizeAliases(name: string, aliases: readonly string[]): string[] {
  const seen = new Set([normName(name)]);
  const out: string[] = [];
  for (const raw of aliases) {
    const alias = tidy(raw);
    const key = normName(alias);
    if (!alias || seen.has(key)) continue;
    seen.add(key);
    out.push(alias);
  }
  return out;
}
