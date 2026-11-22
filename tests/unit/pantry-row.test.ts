import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { PantryItem } from '~~/types/pantry';
import PantryRow from '../../app/components/pantry/PantryRow.vue';

const row = (amount: number, unit: 'count' | 'gram' = 'count') =>
  mount(PantryRow, {
    props: { item: { id: 'tofu', name: 'Tofu', unit, amount } as unknown as PantryItem },
    global: { stubs: { Button: { template: '<button type="button"><slot /></button>' } } }
  });

const minus = (amount: number, unit?: 'count' | 'gram') =>
  row(amount, unit)
    .findAll('button')
    .map((b) => b.attributes('aria-label'))
    .find((label) => label?.startsWith('Use '));

describe('pantry row minus button', () => {
  it('names one when there is one or more', () => {
    expect(minus(2)).toBe('Use 1 Tofu');
  });

  it('names the rest when less than one is left', () => {
    expect(minus(0.5)).toBe('Use ½ Tofu');
    expect(minus(1 / 3)).toBe('Use ⅓ Tofu');
  });

  it('names one gram for an item counted in grams', () => {
    expect(minus(250, 'gram')).toBe('Use 1 g Tofu');
  });
});
