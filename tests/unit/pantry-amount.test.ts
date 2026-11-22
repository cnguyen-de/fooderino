import { describe, expect, it } from 'vitest';
import { amountField, formatAmount, parseAmount, snapUse } from '~~/utils/pantry';

describe('reading an amount', () => {
  it.each([
    ['2', 2],
    [' 0.5 ', 0.5],
    ['0,5', 0.5],
    ['.5', 0.5],
    ['1/3', 0.333333],
    ['2 / 3', 0.666667],
    ['1 1/2', 1.5],
    ['½', 0.5],
    ['⅓', 0.333333],
    ['⅔', 0.666667],
    ['¼', 0.25],
    ['¾', 0.75],
    ['1½', 1.5],
    ['2 ¼', 2.25],
    ['0', 0],
    ['250', 250]
  ])('reads %j as %d', (text, value) => {
    expect(parseAmount(text)).toBe(value);
  });

  it.each(['', '  ', '-1', '-1/2', 'two', '1/0', '1..2', '1,2,3', '½½', '1/2/3', 'e5', '1e3'])('refuses %j', (text) => {
    expect(parseAmount(text)).toBeNull();
  });
});

describe('showing an amount', () => {
  it.each([
    [0, '0'],
    [2, '2'],
    [0.5, '½'],
    [1.5, '1½'],
    [0.333333, '⅓'],
    [0.333334, '⅓'],
    [1 / 3, '⅓'],
    [0.666667, '⅔'],
    [2.25, '2¼'],
    [0.75, '¾'],
    [0.34, '0.34'],
    [0.33, '0.33'],
    [0.4, '0.4'],
    [1.125, '1.13'],
    [0.999, '1']
  ])('shows %d pieces as %j', (amount, text) => {
    expect(formatAmount(amount, 'count')).toBe(text);
  });

  it('shows grams whole, with the unit', () => {
    expect(formatAmount(250, 'gram')).toBe('250 g');
    expect(formatAmount(12.6, 'gram')).toBe('13 g');
    expect(formatAmount(0.4, 'gram')).toBe('0 g');
  });

  it('fills a field with text that reads back to the amount', () => {
    for (const amount of [0, 1, 0.5, 1.5, 0.25, 2.75, 0.4])
      expect(parseAmount(amountField(amount, 'count'))).toBe(amount);
    expect(amountField(1 / 3, 'count')).toBe('⅓');
    expect(amountField(12.5, 'gram')).toBe('12.5');
  });
});

describe('snapping a use to what is left', () => {
  it('takes all of what is left when the leftover would be a sliver', () => {
    expect(snapUse(0.333333, 0.333334, 'count')).toBe(0.333334);
    expect(snapUse(0.995, 1, 'count')).toBe(1);
    expect(snapUse(499.6, 500, 'gram')).toBe(500);
  });

  it('takes all of what is left when asked for a sliver more', () => {
    expect(snapUse(0.34, 0.333334, 'count')).toBe(0.333334);
    expect(snapUse(500.4, 500, 'gram')).toBe(500);
  });

  it('keeps a request that leaves or lacks a real amount', () => {
    expect(snapUse(0.5, 1, 'count')).toBe(0.5);
    expect(snapUse(0.98, 1, 'count')).toBe(0.98);
    expect(snapUse(1, 0.5, 'count')).toBe(1);
    expect(snapUse(499, 500, 'gram')).toBe(499);
  });
});
