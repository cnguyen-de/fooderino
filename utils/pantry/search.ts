import type { Item, ItemId } from '~~/types/pantry';
import { normName } from './ids';
import { isLive } from './merge';

const MATCHES = ['exact', 'prefix', 'word_prefix', 'substring', 'fuzzy'] as const;
export type MatchKind = (typeof MATCHES)[number];
export type MatchField = 'name' | 'alias' | 'tag';

export interface Hit {
  item_id: ItemId;
  via: MatchField;
  match: MatchKind;
  /** The name, alias or tag that matched, as written. */
  text: string;
}

interface Entry {
  via: MatchField;
  text: string;
  norm: string;
  words: string[];
}

/** Fuzzy matching below this length would match nearly every short word. */
const MIN_FUZZY_LENGTH = 3;

function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = row;
  }
  return prev[b.length]!;
}

function matchOf(entry: Entry, q: string): MatchKind | null {
  if (entry.norm === q) return 'exact';
  if (entry.norm.startsWith(q)) return 'prefix';
  if (` ${entry.norm}`.includes(` ${q}`)) return 'word_prefix';
  if (entry.norm.includes(q)) return 'substring';
  if (q.length < MIN_FUZZY_LENGTH) return null;
  const limit = q.length >= 6 ? 2 : 1;
  return [entry.norm, ...entry.words].some((w) => editDistance(q, w, limit) <= limit) ? 'fuzzy' : null;
}

/** Match quality ranks first; at equal quality a name or alias outranks a tag. */
function score(via: MatchField, match: MatchKind): number {
  return MATCHES.indexOf(match) * 2 + (via === 'tag' ? 1 : 0);
}

export function buildSearchIndex(items: readonly Item[]): (query: string) => Hit[] {
  const indexed = items.filter(isLive).map((item) => {
    const entry = (via: MatchField, text: string): Entry => {
      const norm = normName(text);
      return { via, text, norm, words: norm.split(' ') };
    };
    return {
      item,
      sortKey: normName(item.name),
      entries: [
        entry('name', item.name),
        ...item.aliases.map((a) => entry('alias', a)),
        ...item.tags.map((t) => entry('tag', t.name))
      ]
    };
  });

  return (query) => {
    const q = normName(query);
    if (!q) return [];
    const hits: { hit: Hit; score: number; sortKey: string }[] = [];
    for (const { item, sortKey, entries } of indexed) {
      let best: { hit: Hit; score: number } | null = null;
      for (const e of entries) {
        const match = matchOf(e, q);
        if (!match) continue;
        const s = score(e.via, match);
        if (!best || s < best.score) best = { hit: { item_id: item.id, via: e.via, match, text: e.text }, score: s };
      }
      if (best) hits.push({ ...best, sortKey });
    }
    return hits.sort((a, b) => a.score - b.score || a.sortKey.localeCompare(b.sortKey)).map((h) => h.hit);
  };
}
