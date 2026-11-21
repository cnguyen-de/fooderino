import type { LocalDate, PantryItem } from '~~/types/pantry';
import type { CalendarEntry, Month, ProduceKind, Season } from '~~/types/season';
import { normName } from '~~/utils/pantry/ids';
import type { ItemEdit } from '~~/utils/pantry-ops';

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

export function addMonths(month: Month, n: number): Month {
  return ((((month - 1 + n) % 12) + 12) % 12 + 1) as Month;
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

export const itemNames = (item: PantryItem): string[] => [item.name, ...item.aliases];

/** "We buy this": the entry's name becomes another name of the item, and fills its season only when it has none. */
export function linkEdit(item: PantryItem, entry: CalendarEntry): ItemEdit {
  return { aliases: [...item.aliases, entry.name], season: item.season ?? entry.season };
}

/** Items offered for "We buy this": those no calendar entry knows come first, since they are the ones a link helps, then by name. */
export function linkCandidates(items: readonly PantryItem[], calendar: readonly CalendarEntry[]): PantryItem[] {
  const known = (item: PantryItem) => (matchCalendar(calendar, itemNames(item)) ? 1 : 0);
  return [...items].sort((a, b) => known(a) - known(b) || a.name.localeCompare(b.name));
}

export type SeasonRow =
  | {
      source: 'item';
      item: PantryItem;
      season: Season;
      /** `calendar` while the item has no season of its own and shows the one its calendar entry gives. */
      seasonFrom: 'item' | 'calendar';
      kind: ProduceKind | 'other';
      endsThisMonth: boolean;
    }
  | { source: 'calendar'; entry: CalendarEntry; endsThisMonth: boolean };

export const rowName = (row: SeasonRow): string => (row.source === 'item' ? row.item.name : row.entry.name);
export const rowSeason = (row: SeasonRow): Season => (row.source === 'item' ? row.season : row.entry.season);
export const rowKind = (row: SeasonRow): ProduceKind | 'other' => (row.source === 'item' ? row.kind : row.entry.kind);

export interface SeasonView {
  now: SeasonRow[];
  soon: SeasonRow[];
  /** Items with no season whose name the calendar knows; they show in `now` and `soon` with the calendar's season. */
  fillable: { item: PantryItem; season: Season }[];
}

export interface SeasonViewInput {
  /** Live items. */
  items: readonly PantryItem[];
  calendar: readonly CalendarEntry[];
  month: Month;
  soonMonths?: number;
}

const KIND_ORDER: Record<ProduceKind | 'other', number> = { vegetable: 0, fruit: 1, other: 2 };
/** What the household buys ranks above what it never bought. */
const SOURCE_ORDER: Record<SeasonRow['source'], number> = { item: 0, calendar: 1 };

export function buildSeasonView({ items, calendar, month, soonMonths = 2 }: SeasonViewInput): SeasonView {
  const endsThisMonth = (season: Season) => season.to === month && inSeason(season, month);
  const rows: SeasonRow[] = [];
  const claimed = new Set<CalendarEntry>();
  const fillable: SeasonView['fillable'] = [];
  for (const item of items) {
    const entry = matchCalendar(calendar, itemNames(item));
    for (const name of itemNames(item)) {
      const named = matchCalendar(calendar, [name]);
      if (named) claimed.add(named);
    }
    if (!item.season && entry) fillable.push({ item, season: entry.season });
    const season = item.season ?? entry?.season;
    if (!season) continue;
    const seasonFrom = item.season ? 'item' : 'calendar';
    rows.push({ source: 'item', item, season, seasonFrom, kind: entry?.kind ?? 'other', endsThisMonth: endsThisMonth(season) });
  }
  for (const entry of calendar) {
    if (claimed.has(entry)) continue;
    rows.push({ source: 'calendar', entry, endsThisMonth: endsThisMonth(entry.season) });
  }

  const byName = (a: SeasonRow, b: SeasonRow) => rowName(a).localeCompare(rowName(b));
  const bySource = (a: SeasonRow, b: SeasonRow) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
  const until = (row: SeasonRow) => monthsUntil(rowSeason(row), month);
  return {
    now: rows
      .filter((r) => until(r) === 0)
      .sort((a, b) => KIND_ORDER[rowKind(a)] - KIND_ORDER[rowKind(b)] || bySource(a, b) || byName(a, b)),
    soon: rows
      .filter((r) => until(r) > 0 && until(r) <= soonMonths)
      .sort((a, b) => bySource(a, b) || until(a) - until(b) || byName(a, b)),
    fillable
  };
}
