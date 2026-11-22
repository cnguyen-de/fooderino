import type { LocalDate, PantryItem } from '~~/types/pantry';
import type { CalendarEntry, Month, Season } from '~~/types/season';
import { normName } from '~~/utils/pantry/ids';

export function isMonth(v: unknown): v is Month {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 12;
}

/** Exactly `{ from, to }`, both months: the shape the server's `season_valid` check accepts. */
export function isSeason(v: unknown): v is Season {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  const o = v as Record<string, unknown>;
  return keys.length === 2 && isMonth(o.from) && isMonth(o.to);
}

export function monthOf(date: LocalDate): Month {
  return Number(date.slice(5, 7)) as Month;
}

export function inSeason(season: Season, month: Month): boolean {
  return season.from <= season.to
    ? month >= season.from && month <= season.to
    : month >= season.from || month <= season.to;
}

/** Whether the item's own season includes the month of `date`. */
export function inSeasonOn(item: { season: Season | null }, date: LocalDate): boolean {
  return item.season !== null && inSeason(item.season, monthOf(date));
}

/** 0 while in season, else the months until it starts. */
export function monthsUntil(season: Season, month: Month): number {
  return inSeason(season, month) ? 0 : (season.from - month + 12) % 12;
}

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
] as const;

export function monthName(month: Month, style: 'short' | 'long' = 'short'): string {
  return (style === 'short' ? SHORT : LONG)[month - 1]!;
}

/** "Jun–Sep", "Nov–Feb", or "Jul" for a single month. */
export function formatSeason(season: Season): string {
  const from = monthName(season.from);
  return season.from === season.to ? from : `${from}–${monthName(season.to)}`;
}

const indexes = new WeakMap<readonly CalendarEntry[], Map<string, CalendarEntry>>();

function indexOf(calendar: readonly CalendarEntry[]): Map<string, CalendarEntry> {
  let index = indexes.get(calendar);
  if (!index) {
    index = new Map();
    for (const entry of calendar) {
      for (const name of [entry.name, ...entry.aliases]) {
        const key = normName(name);
        if (!index.has(key)) index.set(key, entry);
      }
    }
    indexes.set(calendar, index);
  }
  return index;
}

/** The entry any of `names` stands for, ignoring case and accents. */
export function matchCalendar(calendar: readonly CalendarEntry[], names: readonly string[]): CalendarEntry | undefined {
  const index = indexOf(calendar);
  for (const name of names) {
    const entry = index.get(normName(name));
    if (entry) return entry;
  }
  return undefined;
}

/** The items with a season of their own: those in season first, then by how soon theirs starts, then by name. */
export function seasonalItems(items: readonly PantryItem[], month: Month): SeasonalItem[] {
  return items
    .flatMap((item) => {
      if (!item.season) return [];
      const until = monthsUntil(item.season, month);
      const group: SeasonGroup = until === 0 ? 'now' : until <= SOON_MONTHS ? 'soon' : 'off';
      return [{ item, season: item.season, until, group }];
    })
    .sort((a, b) => a.until - b.until || a.item.name.localeCompare(b.item.name));
}

/** In season now, starting within `SOON_MONTHS`, or further out. */
export type SeasonGroup = 'now' | 'soon' | 'off';
export const SOON_MONTHS = 2;

export interface SeasonalItem {
  item: PantryItem;
  season: Season;
  until: number;
  group: SeasonGroup;
}
