import type { Unit } from '~~/types/pantry';

const FRACTIONS = [
  ['¼', 1 / 4],
  ['½', 1 / 2],
  ['⅓', 1 / 3],
  ['⅔', 2 / 3],
  ['¾', 3 / 4]
] as const;

export const FRACTION_GLYPHS = FRACTIONS.map(([glyph]) => glyph);

/**
 * Every quantity is kept to six decimal places. The server's numeric arithmetic is exact,
 * so quantities rounded here make the reducer's float sums land on the server's values.
 */
export const roundAmount = (n: number) => Math.round(n * 1e6) / 1e6;

const DECIMAL = /^(\d*)[.,]?(\d*)$/;
const GLYPH = /^(?:(\d+)\s*)?([¼½⅓⅔¾])$/;
const FRACTION = /^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/;

/** Reads "2", "0.5", "0,5", "1/3", "1 1/2", "½" or "1½". Null for blank, negative or anything else. */
export function parseAmount(text: string): number | null {
  const s = text.trim();
  const glyph = GLYPH.exec(s);
  if (glyph) return roundAmount(Number(glyph[1] ?? 0) + FRACTIONS.find(([g]) => g === glyph[2])![1]);
  const fraction = FRACTION.exec(s);
  if (fraction) {
    const [, whole, top, bottom] = fraction;
    return Number(bottom) === 0 ? null : roundAmount(Number(whole ?? 0) + Number(top) / Number(bottom));
  }
  const decimal = DECIMAL.exec(s);
  if (!decimal || (decimal[1] === '' && decimal[2] === '')) return null;
  return roundAmount(Number(`${decimal[1] || '0'}.${decimal[2] || '0'}`));
}

const decimalText = (n: number) => String(Number(n.toFixed(2)));

function countText(n: number): string {
  const whole = Math.floor(n);
  const glyph = FRACTIONS.find(([, f]) => Math.abs(n - whole - f) < 0.001)?.[0];
  return glyph ? `${whole || ''}${glyph}` : decimalText(n);
}

/** How an amount reads: "1½" pieces, "0.4", "250 g". */
export function formatAmount(amount: number, unit: Unit): string {
  return unit === 'gram' ? `${Math.round(amount)} g` : countText(amount);
}

/** The text an amount field starts with. `parseAmount` reads it back. */
export function amountField(amount: number, unit: Unit): string {
  return unit === 'gram' ? decimalText(amount) : countText(amount);
}

/** Grams show whole, so under half a gram is nothing anyone would count. */
const SNAP: Record<Unit, number> = { count: 0.01, gram: 0.5 };

/**
 * What a use of `requested` takes from `amount`. A use that would leave a sliver, or ask for a
 * sliver more than is left, takes exactly what is left, so the last third of a pack empties it.
 */
export function snapUse(requested: number, amount: number, unit: Unit): number {
  return Math.abs(amount - requested) < SNAP[unit] ? amount : requested;
}

/** What one tap of use or bin takes: one, or what is left when that is less. */
export function oneUse(amount: number, unit: Unit): number {
  return snapUse(amount > 0 && amount < 1 ? amount : 1, amount, unit);
}
