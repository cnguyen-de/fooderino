import type { Instant, LocalDate } from '~~/types/pantry';

const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function utcMs(d: LocalDate): number {
  return Date.parse(`${d}T00:00:00Z`);
}

function format(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10) as LocalDate;
}

export function isLocalDate(s: unknown): s is LocalDate {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(ms) && format(ms) === s;
}

export function localDate(s: string): LocalDate {
  if (!isLocalDate(s)) throw new RangeError(`Not a YYYY-MM-DD date: ${s}`);
  return s;
}

export function instant(s: string): Instant {
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) throw new RangeError(`Not an instant: ${s}`);
  return new Date(ms).toISOString() as Instant;
}

/** The calendar day this instant falls on in the device's time zone. */
export function localDateOf(at: Instant): LocalDate {
  const d = new Date(at);
  return format(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export function addDays(d: LocalDate, days: number): LocalDate {
  return format(utcMs(d) + days * DAY_MS);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((utcMs(to) - utcMs(from)) / DAY_MS);
}

export function minDate(a: LocalDate | null, b: LocalDate | null): LocalDate | null {
  if (a === null) return b;
  if (b === null) return a;
  return a <= b ? a : b;
}
