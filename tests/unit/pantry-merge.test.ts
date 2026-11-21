import { describe, expect, it } from 'vitest';
import { planHouseholdMerge } from '~~/utils/pantry';
import type { HouseholdId, Item, ItemId, LocalDate } from '~~/utils/pantry';

function item(id: string, name: string, household: string, over: Partial<Item> = {}): Item {
  return {
    id: id as ItemId,
    household_id: household as HouseholdId,
    name,
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
const mine = (id: string, name: string, over?: Partial<Item>) => item(id, name, 'mine', over);
const theirs = (id: string, name: string, over?: Partial<Item>) => item(id, name, 'theirs', over);

describe('planHouseholdMerge', () => {
  it('merges a source into the target item with the same normalized name', () => {
    const plan = planHouseholdMerge(
      [mine('m1', '  MILK ', { amount: 1, to_buy: 2, best_before: '2026-11-20' as LocalDate })],
      [theirs('t1', 'Milk', { amount: 3, best_before: '2026-11-25' as LocalDate })]
    );
    expect(plan.merged).toEqual([
      {
        into: 't1',
        sources: ['m1'],
        result: expect.objectContaining({ id: 't1', amount: 4, to_buy: 2, best_before: '2026-11-20' })
      }
    ]);
    expect(plan.added).toEqual([]);
    expect(plan.ambiguous).toEqual([]);
  });

  it('matches through aliases on either side and unions tags and aliases', () => {
    const plan = planHouseholdMerge(
      [
        mine('m1', 'Semi skimmed', {
          aliases: ['Milk'],
          tags: [
            { kind: 'place', name: 'fridge' },
            { kind: 'store', name: 'Lidl' }
          ]
        })
      ],
      [theirs('t1', 'Whole milk', { aliases: ['milk'], tags: [{ kind: 'place', name: 'Fridge' }] })]
    );
    expect(plan.merged[0]?.result).toMatchObject({
      name: 'Whole milk',
      aliases: ['milk', 'Semi skimmed'],
      tags: [
        { kind: 'place', name: 'Fridge' },
        { kind: 'store', name: 'Lidl' }
      ]
    });
  });

  it('adds the counts of several sources that match one target', () => {
    const plan = planHouseholdMerge(
      [mine('m1', 'Eggs', { amount: 2 }), mine('m2', 'eggs', { amount: 4 })],
      [theirs('t1', 'Eggs', { amount: 6 })]
    );
    expect(plan.merged).toMatchObject([{ into: 't1', sources: ['m1', 'm2'], result: { amount: 12 } }]);
  });

  it('reports a source matching several targets instead of guessing', () => {
    const plan = planHouseholdMerge(
      [mine('m1', 'Milk', { aliases: ['Oat milk'] })],
      [theirs('t1', 'Milk'), theirs('t2', 'Oat milk')]
    );
    expect(plan.ambiguous).toEqual([{ source: 'm1', candidates: ['t1', 't2'], reason: 'several_matches' }]);
    expect(plan.merged).toEqual([]);
  });

  it('reports a match whose unit differs instead of adding grams to counts', () => {
    const plan = planHouseholdMerge([mine('m1', 'Flour', { unit: 'gram' })], [theirs('t1', 'Flour')]);
    expect(plan.ambiguous).toEqual([{ source: 'm1', candidates: ['t1'], reason: 'unit_differs' }]);
  });

  it('brings over unmatched sources as new items and ignores deleted or merged items', () => {
    const plan = planHouseholdMerge(
      [mine('m1', 'Tahini'), mine('m2', 'Milk', { deleted_at: '2026-11-01T00:00:00.000Z' as Item['deleted_at'] })],
      [theirs('t1', 'Tahini', { merged_into: 't2' as ItemId }), theirs('t2', 'Sesame paste'), theirs('t3', 'Milk')]
    );
    expect(plan.added).toEqual(['m1']);
    expect(plan.merged).toEqual([]);
  });
});
