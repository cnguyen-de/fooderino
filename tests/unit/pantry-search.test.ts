import { describe, expect, it } from 'vitest';
import { buildSearchIndex } from '~~/utils/pantry';
import type { HouseholdId, Instant, Item, ItemId, Tag } from '~~/utils/pantry';

function item(id: string, name: string, over: { aliases?: string[]; tags?: Tag[] } & Partial<Item> = {}): Item {
  return {
    id: id as ItemId,
    household_id: 'h1' as HouseholdId,
    name,
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

const items = [
  item('milk', 'Milk', { aliases: ['Melk'], tags: [{ kind: 'place', name: 'Fridge' }] }),
  item('oat', 'Oat milk', { aliases: ['Oatly'], amount: 0 }),
  item('creme', 'Crème fraîche', { tags: [{ kind: 'other', name: 'Dairy' }] }),
  item('salmon', 'Salmon', { tags: [{ kind: 'other', name: 'Fish' }] }),
  item('soap', 'Dish soap', { tags: [{ kind: 'store', name: 'Lidl' }] }),
  item('chicken', 'Chicken thighs'),
  item('gone', 'Milk powder', { deleted_at: '2026-11-01T00:00:00.000Z' as Instant }),
  item('merged', 'Semi skimmed milk', { merged_into: 'milk' as ItemId })
];
const search = buildSearchIndex(items);
const ids = (q: string) => search(q).map((h) => h.item_id);

describe('buildSearchIndex', () => {
  it('finds the same item by German, English and Vietnamese names, with or without accents', () => {
    const index = buildSearchIndex([item('milk', 'Milk', { aliases: ['Milch', 'Sữa'] })]);
    for (const query of ['milk', 'Milch', 'Sữa', 'sua']) {
      expect(index(query)).toHaveLength(1);
      expect(index(query)[0]).toMatchObject({ item_id: 'milk', match: 'exact' });
    }
  });

  it('finds items by alias', () => {
    expect(search('oatly')).toEqual([{ item_id: 'oat', via: 'alias', match: 'exact', text: 'Oatly' }]);
    expect(search('melk')[0]).toMatchObject({ item_id: 'milk', via: 'alias', match: 'exact' });
  });

  it('finds items by any kind of tag', () => {
    expect(ids('fridge')).toEqual(['milk']);
    expect(ids('dairy')).toEqual(['creme']);
    expect(ids('lidl')).toEqual(['soap']);
  });

  it('ranks exact, then prefix, then word prefix, then substring', () => {
    expect(search('milk').map((h) => [h.item_id, h.match])).toEqual([
      ['milk', 'exact'],
      ['oat', 'word_prefix']
    ]);
    expect(search('ilk').map((h) => [h.item_id, h.match])).toEqual([
      ['milk', 'substring'],
      ['oat', 'substring']
    ]);
    expect(search('chick')[0]).toMatchObject({ item_id: 'chicken', match: 'prefix' });
  });

  it('tolerates one typo, and two in longer terms', () => {
    expect(ids('mlik')).toEqual([]);
    expect(search('milc').map((h) => [h.item_id, h.match])).toEqual([
      ['milk', 'fuzzy'],
      ['oat', 'fuzzy']
    ]);
    expect(ids('chikcen')).toEqual(['chicken']);
    expect(ids('mi')).toEqual(['milk', 'oat']);
  });

  it('folds case and diacritics both ways', () => {
    expect(search('creme fraiche')).toMatchObject([{ item_id: 'creme', match: 'exact' }]);
    expect(search('CRÈME')).toMatchObject([{ item_id: 'creme', match: 'prefix' }]);
  });

  it('ranks a name or alias above a tag at the same match quality, but an exact tag above a typo', () => {
    const index = buildSearchIndex([
      item('rice', 'Basmati', { tags: [{ kind: 'other', name: 'Rice' }] }),
      item('vinegar', 'Rice', {})
    ]);
    expect(index('rice').map((h) => [h.item_id, h.via])).toEqual([
      ['vinegar', 'name'],
      ['rice', 'tag']
    ]);
    expect(ids('fish')).toEqual(['salmon', 'soap']);
  });

  it('includes items at zero stock and skips deleted or merged items', () => {
    expect(ids('oat')).toEqual(['oat']);
    expect(ids('powder')).toEqual([]);
    expect(ids('skimmed')).toEqual([]);
  });

  it('returns nothing for a blank query', () => {
    expect(search('   ')).toEqual([]);
  });
});
