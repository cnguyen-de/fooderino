import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { computed, ref } from 'vue';
import type { ItemId, LocalDate, PantryItem } from '~~/types/pantry';
import Seasons from '../../app/pages/seasons.vue';
import ItemSheet from '../../app/components/pantry/ItemSheet.vue';

const item = (name: string, over: Partial<PantryItem> = {}): PantryItem => ({
  id: name as ItemId, name, aliases: [], tags: [], unit: 'count', default_amount: 1, shelf_life_days: null,
  season: null, amount: 0, to_buy: 0, best_before: null, ...over
});

function renderPage(items: PantryItem[]) {
  const ops = { addToShopping: vi.fn(async () => ({ commands: [], sheet: null })) };
  const act = vi.fn((work: () => Promise<unknown>, _message: string) => work());
  vi.stubGlobal('usePantry', () => ({
    view: computed(() => ({ items, byId: (id: ItemId) => items.find((i) => i.id === id) })),
    ops,
    today: ref('2026-11-21' as LocalDate)
  }));
  vi.stubGlobal('usePantryAction', () => act);
  const page = mount(Seasons, {
    global: {
      stubs: {
        NuxtLayout: { template: '<div><slot /></div>' },
        Button: { template: '<button type="button"><slot /></button>' },
        ItemSheet: true
      }
    }
  });
  return { page, ops, act };
}

const rows = (page: ReturnType<typeof mount>) => page.findAll('li');
const rowOf = (page: ReturnType<typeof mount>, name: string) => rows(page).find((r) => r.text().startsWith(name))!;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Seasons page', () => {
  it('lists only the items with a season of their own, in season first, then the soonest to start', () => {
    const { page } = renderPage([
      item('Asparagus', { season: { from: 4, to: 6 } }),
      item('Kale'),
      item('Salt'),
      item('Chicory', { season: { from: 12, to: 3 } }),
      item('Leeks', { season: { from: 9, to: 4 }, amount: 2, to_buy: 1 }),
      item('Apples', { season: { from: 8, to: 11 } })
    ]);

    expect(rows(page).map((r) => r.find('span').text())).toEqual(['Apples', 'Leeks', 'Chicory', 'Asparagus']);
    expect(rowOf(page, 'Leeks').text()).toMatch(/Sep–Apr\s*· in season\s*· in stock · on list/);
    expect(rowOf(page, 'Apples').text()).toMatch(/Aug–Nov\s*· Ends this month/);
    expect(rowOf(page, 'Apples').text()).not.toContain('in season');
    expect(rowOf(page, 'Chicory').text()).toMatch(/^Chicory\s*Dec–Mar\s*List$/);
    expect(page.text()).not.toContain('Kale');
  });

  it('lists an item by its id and opens it in the item editor', async () => {
    const { page, ops, act } = renderPage([item('Apples', { season: { from: 8, to: 11 } })]);

    await rowOf(page, 'Apples').get('button[aria-label="Add Apples to shopping list"]').trigger('click');
    expect(ops.addToShopping).toHaveBeenCalledWith('Apples');
    expect(act).toHaveBeenCalledWith(expect.any(Function), 'Listed Apples');

    await rowOf(page, 'Apples').get('button').trigger('click');
    expect(page.findComponent(ItemSheet).props('id')).toBe('Apples');
  });

  it('says how to get items here when none has a season', () => {
    const { page } = renderPage([item('Kale'), item('Salt')]);
    expect(rows(page)).toHaveLength(0);
    expect(page.text()).toContain('Your items show here once they have a season, set in the item editor.');
  });
});
