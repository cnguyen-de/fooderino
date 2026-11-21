import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'vue-sonner';
import { flushPromises, mount } from '@vue/test-utils';
import { computed, ref } from 'vue';
import type { ItemId, LocalDate, PantryItem } from '~~/types/pantry';
import type { Season } from '~~/types/season';
import Seasons from '../../app/pages/seasons.vue';
import ItemSheet from '../../app/components/pantry/ItemSheet.vue';
import ItemCombobox from '../../app/components/pantry/ItemCombobox.vue';

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
  const edit = (id: ItemId, change: Partial<PantryItem>) => {
    items.value = items.value.map((i) => (i.id === id ? { ...i, ...change } : i));
  };
  const setSeason = (id: ItemId, season: Season) => edit(id, { season });
  const ops = {
    addToShopping: vi.fn(async () => ({ commands: [], sheet: null })),
    createItem: vi.fn(async () => 'new' as ItemId),
    editItem: vi.fn(async (id: ItemId, change: Partial<PantryItem>) => {
      edit(id, change);
      return { commands: [], sheet: null };
    }),
    undo: vi.fn(async () => null)
  };
  vi.stubGlobal('usePantry', () => ({
    view: computed(() => ({ items: items.value, byId: (id: ItemId) => items.value.find((i) => i.id === id) })),
    ops,
    search: (q: string) =>
      items.value.filter((i) => i.name.toLowerCase().includes(q.toLowerCase())).map((i) => ({ item: i })),
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

const listButton = (page: ReturnType<typeof mount>, name: string) =>
  rowOf(page, name).get(`button[aria-label="Add ${name} to shopping list"]`);

vi.mock('vue-sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(toast).mockClear();
});

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

    await listButton(page, 'Grünkohl').trigger('click');
    await listButton(page, 'Apples').trigger('click');

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
    expect(rowOf(page, 'Kale').text()).toMatch(/Nov–Feb.*calendar season/);
    expect(page.text()).not.toContain('Salt');

    setSeason('Brussels sprouts' as ItemId, { from: 9, to: 9 });
    await page.findAll('button').find((b) => b.text() === 'Fill seasons')!.trigger('click');
    await flushPromises();

    expect(ops.editItem.mock.calls).toEqual([['Kale', { season: { from: 11, to: 2 } }]]);
    expect(page.text()).not.toContain('Fill seasons');
    expect(rowOf(page, 'Kale').text()).not.toContain('calendar season');
  });

  it('steps through the months across the year end', async () => {
    const { page } = renderPage([]);
    const heading = () => page.get('h2').text();
    const click = (label: string) => page.get(`button[aria-label="${label}"]`).trigger('click');

    expect(heading()).toBe('November');
    await click('Next month');
    expect(heading()).toBe('December');
    expect(rowOf(page, 'Chicorée').text()).not.toContain('next month');
    await click('Next month');
    expect(heading()).toBe('January');
    await click('Previous month');
    await click('Previous month');
    await click('Previous month');
    expect(heading()).toBe('October');
  });

  it('jumps to any month from the grid, marking today, and says when a month has nothing', async () => {
    const { page } = renderPage([]);
    const toggle = page.get('button[aria-label="All months"]');
    const months = () => page.findAll('[role="group"] button');
    const jump = async (month: string) => {
      await toggle.trigger('click');
      await page.get(`[role="group"] button[aria-label="${month}"]`).trigger('click');
    };

    expect(months()).toHaveLength(0);
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(months().map((b) => b.text())).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
    const november = page.get('[aria-label="November, this month"]');
    expect(november.attributes('aria-pressed')).toBe('true');
    expect(november.find('[data-today]').exists()).toBe(true);
    expect(page.findAll('[data-today]')).toHaveLength(1);
    await toggle.trigger('click');

    await jump('August');
    expect(months()).toHaveLength(0);
    expect(page.get('h2').text()).toBe('August');
    expect(page.text()).toContain('Äpfel');
    await toggle.trigger('click');
    expect(page.get('[aria-label="August"]').attributes('aria-pressed')).toBe('true');
    expect(page.get('[aria-label="November, this month"]').find('[data-today]').exists()).toBe(true);
    await toggle.trigger('click');

    await jump('July');
    expect(page.text()).toContain('Nothing on the season calendar for July.');
    await jump('June');
    expect(page.text()).toContain('Spargel');
    expect(page.text()).toContain('Ends this month');

    await jump('November, this month');
    expect(page.get('h2').text()).toBe('November');
  });

  it('links a never-bought entry to the household item it is, with an undo', async () => {
    const { page, ops } = renderPage([item('Cải xoăn', { amount: 1 }), item('Salt')]);
    expect(rowOf(page, 'Grünkohl').text()).toContain('Never bought');

    await rowOf(page, 'Grünkohl').get('button[aria-expanded]').trigger('click');
    page.findComponent(ItemCombobox).vm.$emit('pick', item('Cải xoăn', { amount: 1 }));
    await flushPromises();

    expect(ops.editItem).toHaveBeenCalledWith('Cải xoăn', { aliases: ['Grünkohl'], season: { from: 11, to: 2 } });
    expect(page.text()).not.toContain('Grünkohl');
    expect(rowOf(page, 'Cải xoăn').text()).toMatch(/Nov–Feb.*in stock/);
    expect(page.findComponent(ItemCombobox).exists()).toBe(false);

    const [message, options] = vi.mocked(toast).mock.calls.at(-1)! as [string, { action: { onClick: () => Promise<void> } }];
    expect(message).toBe('Cải xoăn now counts as Grünkohl');
    await options.action.onClick();
    expect(ops.undo).toHaveBeenCalledTimes(1);
  });

  it('keeps one picker open, offering items the calendar does not know first', async () => {
    const { page } = renderPage([item('Kale'), item('Tofu'), item('Cải xoăn'), item('Apples', { season: { from: 8, to: 11 } })]);
    const weBuy = (name: string) => rowOf(page, name).get('button[aria-expanded]');

    await weBuy('Rosenkohl').trigger('click');
    await weBuy('Chicorée').trigger('click');
    const pickers = page.findAllComponents(ItemCombobox);
    expect(pickers).toHaveLength(1);
    expect(pickers[0]!.props('label')).toBe('Which of your items is Chicorée?');
    expect(weBuy('Rosenkohl').attributes('aria-expanded')).toBe('false');
    expect(pickers[0]!.props('suggestions')!.map((i: PantryItem) => i.name)).toEqual(['Cải xoăn', 'Tofu', 'Apples', 'Kale']);

    await weBuy('Chicorée').trigger('click');
    expect(page.findAllComponents(ItemCombobox)).toHaveLength(0);
  });
});
