import { describe, expect, it } from 'vitest';
import type { ItemId, PantryItem } from '~~/types/pantry';
import type { CalendarEntry, Month, Season } from '~~/types/season';
import { formatSeason, inSeason, matchCalendar, monthsUntil, seasonalItems } from '~~/utils/seasons';

const NOV_FEB: Season = { from: 11, to: 2 };

const CALENDAR: readonly CalendarEntry[] = [
  { name: 'Grünkohl', aliases: ['Kale'], kind: 'vegetable', season: NOV_FEB },
  { name: 'Äpfel', aliases: ['Apples'], kind: 'fruit', season: { from: 8, to: 11 } }
];

const item = (name: string, over: Partial<PantryItem> = {}): PantryItem => ({
  id: name as ItemId, name, aliases: [], tags: [], unit: 'count', default_amount: 1, shelf_life_days: null,
  season: null, amount: 0, to_buy: 0, best_before: null, ...over
});

describe('season months', () => {
  it('runs past December when it starts after it ends', () => {
    expect([1, 2, 3, 10, 11, 12].map((m) => inSeason(NOV_FEB, m as Month))).toEqual([true, true, false, false, true, true]);
  });

  it('holds a single-month season in that month only', () => {
    expect(inSeason({ from: 7, to: 7 }, 7)).toBe(true);
    expect(inSeason({ from: 7, to: 7 }, 6)).toBe(false);
    expect(inSeason({ from: 7, to: 7 }, 8)).toBe(false);
  });

  it('counts the months until a season starts, across the year boundary', () => {
    expect(monthsUntil(NOV_FEB, 12)).toBe(0);
    expect(monthsUntil(NOV_FEB, 3)).toBe(8);
    expect(monthsUntil(NOV_FEB, 10)).toBe(1);
    expect(monthsUntil({ from: 2, to: 4 }, 11)).toBe(3);
    expect(monthsUntil({ from: 7, to: 7 }, 8)).toBe(11);
  });

  it('formats a range, a wrapping range and a single month', () => {
    expect(formatSeason({ from: 6, to: 9 })).toBe('Jun–Sep');
    expect(formatSeason(NOV_FEB)).toBe('Nov–Feb');
    expect(formatSeason({ from: 7, to: 7 })).toBe('Jul');
  });
});

describe('matchCalendar', () => {
  it('matches an item name or alias against entry names and aliases, ignoring case and accents', () => {
    expect(matchCalendar(CALENDAR, ['KALE'])?.name).toBe('Grünkohl');
    expect(matchCalendar(CALENDAR, ['Cải xoăn', 'grunkohl'])?.name).toBe('Grünkohl');
    expect(matchCalendar(CALENDAR, ['  APFEL '])?.name).toBe('Äpfel');
    expect(matchCalendar(CALENDAR, ['Milk'])).toBeUndefined();
  });
});

describe('seasonalItems', () => {
  const names = (rows: { item: PantryItem }[]) => rows.map((r) => r.item.name);

  it('lists only items with a season of their own, even when the calendar knows the rest', () => {
    const leeks = item('Leeks', { season: { from: 9, to: 4 } });
    expect(seasonalItems([item('Kale'), item('Salt'), leeks], 11)).toEqual([
      { item: leeks, season: leeks.season, until: 0, group: 'now', endsThisMonth: false }
    ]);
  });

  it('puts what is in season first, then the soonest to start, ties by name', () => {
    const rows = seasonalItems(
      [
        item('Asparagus', { season: { from: 4, to: 6 } }),
        item('Strawberries', { season: { from: 5, to: 7 } }),
        item('Kale', { season: NOV_FEB }),
        item('Chicory', { season: { from: 12, to: 3 } }),
        item('Apples', { season: { from: 8, to: 11 } }),
        item('Rhubarb', { season: { from: 4, to: 6 } })
      ],
      11
    );
    expect(names(rows)).toEqual(['Apples', 'Kale', 'Chicory', 'Asparagus', 'Rhubarb', 'Strawberries']);
    expect(rows.map((r) => r.until)).toEqual([0, 0, 1, 5, 5, 6]);
  });

  it('puts what ends this month first in its group, then what is in stock', () => {
    const rows = seasonalItems(
      [
        item('Apples', { season: { from: 8, to: 11 } }),
        item('Kale', { season: NOV_FEB }),
        item('Leeks', { season: { from: 9, to: 4 }, amount: 2 }),
        item('Pears', { season: { from: 8, to: 11 }, amount: 1 }),
        item('Chicory', { season: { from: 12, to: 3 } }),
        item('Lamb lettuce', { season: { from: 1, to: 3 }, amount: 1 })
      ],
      11
    );
    expect(rows.map((r) => [r.item.name, r.group, r.endsThisMonth])).toEqual([
      ['Pears', 'now', true],
      ['Apples', 'now', true],
      ['Leeks', 'now', false],
      ['Kale', 'now', false],
      ['Lamb lettuce', 'soon', false],
      ['Chicory', 'soon', false]
    ]);
  });

  it('groups into in season, starting within two months, and further out', () => {
    const rows = seasonalItems(
      [
        item('Kale', { season: NOV_FEB }),
        item('Chicory', { season: { from: 12, to: 3 } }),
        item('Lamb lettuce', { season: { from: 1, to: 3 } }),
        item('Asparagus', { season: { from: 4, to: 6 } })
      ],
      11
    );
    expect(rows.map((r) => [r.item.name, r.group])).toEqual([
      ['Kale', 'now'],
      ['Chicory', 'soon'],
      ['Lamb lettuce', 'soon'],
      ['Asparagus', 'off']
    ]);
  });

  it('counts a season that runs past December as in season in January and starting soon in October', () => {
    const kale = item('Kale', { season: NOV_FEB });
    expect(seasonalItems([kale], 1)[0]!.until).toBe(0);
    expect(seasonalItems([kale], 10)[0]!.until).toBe(1);
    expect(seasonalItems([kale], 3)[0]!.until).toBe(8);
  });
});
