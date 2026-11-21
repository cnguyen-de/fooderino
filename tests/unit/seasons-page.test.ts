import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { computed, ref } from 'vue';
import type { ItemId, LocalDate, PantryItem } from '~~/types/pantry';
import type { Season } from '~~/types/season';
import Seasons from '../../app/pages/seasons.vue';
import ItemSheet from '../../app/components/pantry/ItemSheet.vue';

vi.mock('~~/utils/seasons/calendar', () => ({
  SEASON_CALENDAR: [
    { name: 'Grünkohl', aliases: ['Kale'], kind: 'vegetable', season: { from: 11, to: 2 } },
    { name: 'Rosenkohl', aliases: ['Brussels sprouts'], kind: 'vegetable', season: { from: 10, to: 3 } },
    { name: 'Äpfel', aliases: ['Apples'], kind: 'fruit', season: { from: 8, to: 11 } },
    { name: 'Chicorée', aliases: ['Chicory'], kind: 'vegetable', season: { from: 12, to: 3 } },
    { name: 'Spargel', aliases: ['Asparagus'], kind: 'vegetable', season: { from: 4, to: 6 } }
  ]
}));

const item = (name: string, over: Partial<PantryItem> = {}): PantryItem => ({
  id: name as ItemId, name, aliases: [], tags: [], unit: 'count', default_amount: 1, shelf_life_days: null,
  season: null, amount: 0, to_buy: 0, best_before: null, ...over
});

function renderPage(start: PantryItem[]) {
  const items = ref(start);
  const setSeason = (id: ItemId, season: Season) => {
    items.value = items.value.map((i) => (i.id === id ? { ...i, season } : i));
  };
  const ops = {
    addToShopping: vi.fn(async () => ({ commands: [], sheet: null })),
    createItem: vi.fn(async () => 'new' as ItemId),
    editItem: vi.fn(async (id: ItemId, edit: { season: Season }) => {
      setSeason(id, edit.season);
      return { commands: [], sheet: null };
    }),
    undo: vi.fn(async () => null)
  };
  vi.stubGlobal('usePantry', () => ({
    view: computed(() => ({ items: items.value, byId: (id: ItemId) => items.value.find((i) => i.id === id) })),
    ops,
    today: ref('2026-11-21' as LocalDate)
  }));
  vi.stubGlobal('usePantryAction', () => (work: () => Promise<unknown>) => work());
  const passthrough = { template: '<div><slot /></div>' };
  const page = mount(Seasons, {
    global: {
      stubs: {
        NuxtLayout: passthrough,
        Button: { template: '<button type="button"><slot /></button>' },
        ItemSheet: true
      }
    }
  });
  return { page, ops, setSeason };
}

const rowOf = (page: ReturnType<typeof mount>, name: string) =>
  page.findAll('div.rounded-lg').find((r) => r.text().startsWith(name))!;

afterEach(() => vi.unstubAllGlobals());

describe('Seasons page', () => {
  it('groups this month\'s produce by kind with each row\'s stock, and what starts next', () => {
    const { page } = renderPage([item('Apples', { season: { from: 8, to: 11 }, amount: 2, to_buy: 1 })]);
    const text = page.text();

    expect(text).toContain('November');
    expect(text.indexOf('Vegetables')).toBeLessThan(text.indexOf('Fruits'));
    expect(rowOf(page, 'Grünkohl').text()).toContain('Nov–Feb');
    expect(rowOf(page, 'Grünkohl').text()).toContain('Never bought');
    expect(rowOf(page, 'Apples').text()).toContain('in stock · on list');
    expect(rowOf(page, 'Apples').text()).toContain('Ends this month');
    expect(text).not.toMatch(/Äpfel/);
    expect(rowOf(page, 'Chicorée').text()).toContain('next month');
    expect(text).not.toContain('Spargel');
  });

  it('lists a calendar entry as a new item carrying its names and season, and a household item by its id', async () => {
    const { page, ops } = renderPage([item('Apples', { season: { from: 8, to: 11 } })]);

    await rowOf(page, 'Grünkohl').get('button').trigger('click');
    await rowOf(page, 'Apples').findAll('button').at(-1)!.trigger('click');

    expect(ops.createItem).toHaveBeenCalledWith({
      name: 'Grünkohl', aliases: ['Kale'], season: { from: 11, to: 2 }, to_buy: 1
    });
    expect(ops.addToShopping).toHaveBeenCalledWith('Apples');
  });

  it('opens the item editor from a household item row', async () => {
    const { page } = renderPage([item('Apples', { season: { from: 8, to: 11 } })]);
    await rowOf(page, 'Apples').get('button').trigger('click');
    expect(page.findComponent(ItemSheet).props('id')).toBe('Apples');
  });

  it('fills only seasons still empty at click time, once', async () => {
    const { page, ops, setSeason } = renderPage([item('Kale'), item('Brussels sprouts'), item('Salt')]);
    expect(page.text()).toContain('2 of your items match the season calendar');

    setSeason('Brussels sprouts' as ItemId, { from: 9, to: 9 });
    await page.findAll('button').find((b) => b.text() === 'Fill seasons')!.trigger('click');
    await flushPromises();

    expect(ops.editItem.mock.calls).toEqual([['Kale', { season: { from: 11, to: 2 } }]]);
    expect(page.text()).not.toContain('Fill seasons');
  });

  it('pages through months and says when a month has nothing', async () => {
    const { page } = renderPage([]);
    const next = page.findAll('button').find((b) => b.attributes('aria-label') === 'Next month')!;
    for (let i = 0; i < 9; i++) await next.trigger('click');

    expect(page.text()).toContain('August');
    expect(page.text()).toContain('Back to November');
    expect(page.text()).toContain('Äpfel');
    const previous = page.findAll('button').find((b) => b.attributes('aria-label') === 'Previous month')!;
    await previous.trigger('click');
    expect(page.text()).toContain('Nothing on the season calendar for July.');
    await previous.trigger('click');
    expect(page.text()).toContain('June');
    expect(page.text()).toContain('Spargel');
    expect(page.text()).toContain('Ends this month');
  });
});
