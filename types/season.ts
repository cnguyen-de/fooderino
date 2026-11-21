export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** Inclusive months. A season with `from > to` runs past December, such as November to February. */
export interface Season {
  from: Month;
  to: Month;
}

export type ProduceKind = 'vegetable' | 'fruit';

/** One line of the German season calendar shipped with the app. */
export interface CalendarEntry {
  /** As German shops label it. */
  name: string;
  /** Other names the household may use (English, Vietnamese, spellings). Matched with `normName` against item names and aliases. */
  aliases: readonly string[];
  kind: ProduceKind;
  season: Season;
}
