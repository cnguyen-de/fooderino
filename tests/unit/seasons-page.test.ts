import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { computed, nextTick, ref } from 'vue';
import type { ItemId, LocalDate, PantryItem } from '~~/types/pantry';
import Seasons from '../../app/pages/seasons.vue';
import ItemSheet from '../../app/components/pantry/ItemSheet.vue';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../app/components/ui/collapsible';

const item = (name: string, over: Partial<PantryItem> = {}): PantryItem => ({
  id: name as ItemId, name, aliases: [], tags: [], unit: 'count', default_amount: 1, shelf_life_days: null,
  season: null, amount: 0, to_buy: 0, best_before: null, ...over
});

async function renderPage(items: PantryItem[]) {
  const ops = { addToShopping: vi.fn(async () => ({ commands: [], sheet: null })) };
  const act = vi.fn((work: () => Promise<unknown>, _message: string) => work());
  vi.stubGlobal('usePantry', () => ({
    view: computed(() => ({ items, byId: (id: ItemId) => items.find((i) => i.id === id) })),
    ops,
    today: ref('2026-11-21' as LocalDate)
  }));
  vi.stubGlobal('usePantryAction', () => act);
  const page = mount(Seasons, {
    attachTo: document.body,
    global: {
      components: { Collapsible, CollapsibleContent, CollapsibleTrigger },
      stubs: {
        NuxtLayout: { template: '<div><slot /></div>' },
        Button: { template: '<button type="button"><slot /></button>' },
        ItemSheet: true
      }
    }
  });
  await nextTick();
  return { page, ops, act };
}

const rows = (page: ReturnType<typeof mount>) => page.findAll('li');
const rowOf = (page: ReturnType<typeof mount>, name: string) => rows(page).find((r) => r.text().startsWith(name))!;

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('Seasons page', () => {
  it('groups the items with a season of their own into in season, upcoming and not available', async () => {
    const { page } = await renderPage([
      item('Asparagus', { season: { from: 4, to: 6 } }),
      item('Kale'),
      item('Salt'),
      item('Chicory', { season: { from: 12, to: 3 } }),
      item('Leeks', { season: { from: 9, to: 4 }, amount: 2, to_buy: 1 }),
      item('Apples', { season: { from: 8, to: 11 } })
    ]);

    expect(page.findAll('button[aria-controls]').map((b) => b.text())).toEqual(['In season2', 'Upcoming1', 'Not available1']);
    expect(rows(page).map((r) => r.find('span').text())).toEqual(['Apples', 'Leeks', 'Chicory']);
    expect(rowOf(page, 'Leeks').text()).toMatch(/^Leeks\s*Sep–Apr\s*· in stock · on list\s*List$/);
    expect(rowOf(page, 'Apples').text()).toMatch(/Aug–Nov\s*· Ends this month/);
    expect(rowOf(page, 'Chicory').text()).toMatch(/^Chicory\s*Dec–Mar\s*List$/);
    expect(page.text()).not.toContain('Kale');
  });

  it('opens and closes a group', async () => {
    const { page } = await renderPage([
      item('Apples', { season: { from: 8, to: 11 } }),
      item('Asparagus', { season: { from: 4, to: 6 } })
    ]);
    const toggle = (label: string) => page.findAll('button[aria-controls]').find((b) => b.text().startsWith(label))!;

    await toggle('Not available').trigger('click');
    expect(rows(page).map((r) => r.find('span').text())).toEqual(['Apples', 'Asparagus']);

    await toggle('In season').trigger('click');
    await toggle('Not available').trigger('click');
    expect(rows(page)).toHaveLength(0);
  });

  it('lists an item by its id and opens it in the item editor', async () => {
    const { page, ops, act } = await renderPage([item('Apples', { season: { from: 8, to: 11 } })]);

    await rowOf(page, 'Apples').get('button[aria-label="Add Apples to shopping list"]').trigger('click');
    expect(ops.addToShopping).toHaveBeenCalledWith('Apples');
    expect(act).toHaveBeenCalledWith(expect.any(Function), 'Listed Apples');

    await rowOf(page, 'Apples').get('button').trigger('click');
    expect(page.findComponent(ItemSheet).props('id')).toBe('Apples');
  });

  it('says how to get items here when none has a season', async () => {
    const { page } = await renderPage([item('Kale'), item('Salt')]);
    expect(rows(page)).toHaveLength(0);
    expect(page.text()).toContain('Your items show here once they have a season, set in the item editor.');
  });
});
