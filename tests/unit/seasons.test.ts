import { describe, expect, it } from 'vitest';
import type { ItemId, PantryItem } from '~~/types/pantry';
import type { CalendarEntry, Month, Season } from '~~/types/season';
import {
  buildSeasonView,
  formatSeason,
  inSeason,
  linkEdit,
  matchCalendar,
  monthsUntil,
  rowName,
  type SeasonRow
} from '~~/utils/seasons';

const NOV_FEB: Season = { from: 11, to: 2 };

const CALENDAR: readonly CalendarEntry[] = [
  { name: 'Grünkohl', aliases: ['Kale'], kind: 'vegetable', season: NOV_FEB },
  { name: 'Äpfel', aliases: ['Apples'], kind: 'fruit', season: { from: 8, to: 11 } },
  { name: 'Rosenkohl', aliases: ['Brussels sprouts'], kind: 'vegetable', season: { from: 10, to: 3 } },
  { name: 'Spargel', aliases: ['Asparagus'], kind: 'vegetable', season: { from: 4, to: 6 } },
  { name: 'Rhabarber', aliases: ['Rhubarb'], kind: 'vegetable', season: { from: 4, to: 6 } },
  { name: 'Erdbeeren', aliases: ['Strawberries'], kind: 'fruit', season: { from: 5, to: 7 } },
  { name: 'Kirschen', aliases: ['Cherries'], kind: 'fruit', season: { from: 6, to: 6 } }
];

const item = (name: string, over: Partial<PantryItem> = {}): PantryItem => ({
  id: name as ItemId, name, aliases: [], tags: [], unit: 'count', default_amount: 1, shelf_life_days: null,
  season: null, amount: 0, to_buy: 0, best_before: null, ...over
});

const names = (rows: readonly SeasonRow[]) => rows.map((r) => `${r.source}:${rowName(r)}`);

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

describe('buildSeasonView', () => {
  it('lists vegetables, fruits, then other in season, by name, with the calendar entries nobody bought', () => {
    const v = buildSeasonView({
      items: [item('Wildgulasch', { season: { from: 10, to: 12 } }), item('Apples', { season: { from: 8, to: 11 } })],
      calendar: CALENDAR,
      month: 11
    });
    expect(names(v.now)).toEqual(['calendar:Grünkohl', 'calendar:Rosenkohl', 'item:Apples', 'item:Wildgulasch']);
    expect(v.now.find((r) => r.source === 'item' && r.item.name === 'Apples')).toMatchObject({ kind: 'fruit', endsThisMonth: true });
    expect(v.now.find((r) => r.source === 'item' && r.item.name === 'Wildgulasch')).toMatchObject({ kind: 'other', endsThisMonth: false });
  });

  it('replaces a calendar entry with the household item that names it, through an alias in another case and accent', () => {
    const kale = item('Cải xoăn', { aliases: ['GRUNKOHL'], season: NOV_FEB, amount: 1 });
    const v = buildSeasonView({ items: [kale], calendar: CALENDAR, month: 1 });
    expect(names(v.now)).toEqual(['item:Cải xoăn', 'calendar:Rosenkohl']);
    expect(v.now[0]).toMatchObject({ source: 'item', item: kale, kind: 'vegetable' });
  });

  it('shows an item with no season under its calendar entry\'s season, offering it to fill', () => {
    const sprouts = item('Brussels sprouts');
    const v = buildSeasonView({ items: [sprouts, item('Salt')], calendar: CALENDAR, month: 11 });
    expect(names(v.now)).toEqual(['item:Brussels sprouts', 'calendar:Grünkohl', 'calendar:Äpfel']);
    expect(v.now[0]).toMatchObject({ season: { from: 10, to: 3 }, seasonFrom: 'calendar', kind: 'vegetable' });
    expect(v.fillable).toEqual([{ item: sprouts, season: { from: 10, to: 3 } }]);
  });

  it('marks a season the item sets itself as its own', () => {
    const v = buildSeasonView({ items: [item('Kale', { season: { from: 10, to: 12 } })], calendar: CALENDAR, month: 10 });
    expect(v.now.find((r) => r.source === 'item')).toMatchObject({ season: { from: 10, to: 12 }, seasonFrom: 'item' });
  });

  it('places unfilled items by the calendar season in soon, soonest first, then by name', () => {
    const v = buildSeasonView({
      items: [item('Strawberries'), item('Asparagus'), item('Rhubarb', { season: { from: 5, to: 6 } })],
      calendar: CALENDAR,
      month: 3
    });
    expect(names(v.soon)).toEqual(['item:Asparagus', 'item:Rhubarb', 'item:Strawberries']);
    expect(v.soon.map((r) => r.source === 'item' && r.seasonFrom)).toEqual(['calendar', 'item', 'calendar']);
  });

  it('shows what starts within the window, soonest first, and nothing further out', () => {
    const v = buildSeasonView({ items: [], calendar: CALENDAR, month: 3 });
    expect(names(v.soon)).toEqual(['calendar:Rhabarber', 'calendar:Spargel', 'calendar:Erdbeeren']);
    expect(names(buildSeasonView({ items: [], calendar: CALENDAR, month: 3, soonMonths: 1 }).soon)).toEqual([
      'calendar:Rhabarber',
      'calendar:Spargel'
    ]);
  });

  it('ranks bought items above never-bought entries of the same kind, in season now and coming soon', () => {
    const calendar: CalendarEntry[] = [
      { name: 'Aubergine', aliases: [], kind: 'vegetable', season: { from: 11, to: 11 } },
      { name: 'Zwiebeln', aliases: ['Onions'], kind: 'vegetable', season: { from: 10, to: 12 } },
      { name: 'Artischocke', aliases: [], kind: 'vegetable', season: { from: 12, to: 1 } },
      { name: 'Zitronen', aliases: ['Lemons'], kind: 'vegetable', season: { from: 1, to: 3 } }
    ];
    const v = buildSeasonView({
      items: [item('Onions', { season: { from: 10, to: 12 } }), item('Lemons', { season: { from: 1, to: 3 } })],
      calendar,
      month: 11
    });
    expect(names(v.now)).toEqual(['item:Onions', 'calendar:Aubergine']);
    expect(names(v.soon)).toEqual(['item:Lemons', 'calendar:Artischocke']);
  });

  it('is empty for a month the calendar has nothing for', () => {
    const v = buildSeasonView({ items: [], calendar: [CALENDAR[3]!], month: 9 });
    expect(v).toEqual({ now: [], soon: [], fillable: [] });
  });
});

describe('linkEdit', () => {
  it('adds the entry name to the item names and fills the season only when the item has none', () => {
    const grunkohl = CALENDAR[0]!;
    expect(linkEdit(item('Cải xoăn', { aliases: ['Curly kale'] }), grunkohl)).toEqual({
      aliases: ['Curly kale', 'Grünkohl'],
      season: NOV_FEB
    });
    expect(linkEdit(item('Cải xoăn', { season: { from: 10, to: 1 } }), grunkohl)).toEqual({
      aliases: ['Grünkohl'],
      season: { from: 10, to: 1 }
    });
  });

  it('swaps the never-bought entry for the linked item', () => {
    const kale = item('Cải xoăn', { amount: 1 });
    const before = buildSeasonView({ items: [kale], calendar: CALENDAR, month: 11 });
    expect(names(before.now)).toContain('calendar:Grünkohl');

    const linked = { ...kale, ...linkEdit(kale, CALENDAR[0]!) };
    const after = buildSeasonView({ items: [linked], calendar: CALENDAR, month: 11 });
    expect(names(after.now)).toEqual(['item:Cải xoăn', 'calendar:Rosenkohl', 'calendar:Äpfel']);
    expect(after.now[0]).toMatchObject({ kind: 'vegetable', season: NOV_FEB });
  });

  it('lets one item stand for a second entry, keeping its own season', () => {
    const kohl = item('Kale', { season: { from: 9, to: 3 } });
    const linked = { ...kohl, ...linkEdit(kohl, CALENDAR[2]!) };
    expect(linked.season).toEqual({ from: 9, to: 3 });
    const v = buildSeasonView({ items: [linked], calendar: CALENDAR, month: 11 });
    expect(names(v.now)).toEqual(['item:Kale', 'calendar:Äpfel']);
  });
});
