import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { computed, ref } from 'vue';
import type { ItemId, PantryItem } from '~~/types/pantry';
import ItemSheet from '../../app/components/pantry/ItemSheet.vue';

vi.mock('~~/utils/seasons/calendar', () => ({
  SEASON_CALENDAR: [{ name: 'Grünkohl', aliases: ['Kale'], kind: 'vegetable', season: { from: 11, to: 2 } }]
}));

const salt: PantryItem = {
  id: 'salt' as ItemId,
  name: 'Salt',
  aliases: [],
  tags: [],
  unit: 'count',
  default_amount: 1,
  shelf_life_days: null,
  season: null,
  amount: 1,
  to_buy: 0,
  best_before: null
};
const cream: PantryItem = { ...salt, id: 'cream' as ItemId, name: 'Cream', amount: 0.333334, to_buy: 0.5 };

function renderSheet(props: { id: ItemId | null; creating?: boolean; initialName?: string }) {
  const ops = {
    createItem: vi.fn(async () => 'new' as ItemId),
    editItem: vi.fn(async () => ({ commands: [], sheet: null }))
  };
  vi.stubGlobal('usePantry', () => ({
    view: computed(() => ({ byId: (id: ItemId) => [salt, cream].find((i) => i.id === id) })),
    search: () => [],
    ops,
    tagOptions: ref([])
  }));
  vi.stubGlobal('usePantryAction', () => vi.fn());
  const passthrough = { template: '<div><slot /></div>' };
  const sheet = mount(ItemSheet, {
    props: { id: null },
    global: {
      stubs: {
        Drawer: passthrough,
        DrawerContent: passthrough,
        DrawerHeader: passthrough,
        DrawerTitle: passthrough,
        DrawerDescription: passthrough,
        Collapsible: passthrough,
        CollapsibleTrigger: passthrough,
        CollapsibleContent: passthrough,
        Button: { template: '<button><slot /></button>' },
        Input: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
        },
        NuxtLink: passthrough,
        TagCombobox: true,
        AlertDialogRoot: true
      }
    }
  });
  return { sheet, ops, open: () => sheet.setProps(props) };
}

const begin = (sheet: ReturnType<typeof mount>) => sheet.get<HTMLSelectElement>('select[aria-label="Season begins"]');
const end = (sheet: ReturnType<typeof mount>) => sheet.get<HTMLSelectElement>('select[aria-label="Season ends"]');

afterEach(() => vi.unstubAllGlobals());

describe('item editor season', () => {
  it("fills a new item's season from the calendar and saves it", async () => {
    const { sheet, ops, open } = renderSheet({ id: null, creating: true, initialName: 'kale' });
    await open();

    expect([begin(sheet).element.value, end(sheet).element.value]).toEqual(['11', '2']);
    expect(sheet.text()).toContain('Filled from the season calendar');
    await sheet.get('form').trigger('submit');
    await flushPromises();

    expect(ops.createItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'kale', season: { from: 11, to: 2 } }));
  });

  it('keeps a cleared season cleared while the name changes', async () => {
    const { sheet, ops, open } = renderSheet({ id: null, creating: true, initialName: 'Kale' });
    await open();
    await sheet
      .findAll('button')
      .find((b) => b.text() === 'No season')!
      .trigger('click');
    await sheet.get('input').setValue('Grünkohl');

    expect(begin(sheet).element.value).toBe('');
    await sheet.get('form').trigger('submit');
    await flushPromises();
    expect(ops.createItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'Grünkohl', season: null }));
  });

  it('sets a season by hand on an existing item', async () => {
    const { sheet, ops, open } = renderSheet({ id: salt.id });
    await open();
    expect(begin(sheet).element.value).toBe('');

    await begin(sheet).setValue('6');
    expect(end(sheet).element.value).toBe('6');
    await end(sheet).setValue('9');
    await sheet.get('form').trigger('submit');
    await flushPromises();

    expect(ops.editItem).toHaveBeenCalledWith(salt.id, expect.objectContaining({ season: { from: 6, to: 9 } }));
  });
});

const field = (sheet: ReturnType<typeof mount>, label: string) =>
  sheet.get<HTMLInputElement>(`input[aria-label="${label}"]`);
const saveButton = (sheet: ReturnType<typeof mount>) =>
  sheet.findAll('button').find((b) => b.text() === 'Save changes')!;

describe('item editor amounts', () => {
  it('shows fractions and saves typed fractions and decimal commas', async () => {
    const { sheet, ops, open } = renderSheet({ id: cream.id });
    await open();
    expect(field(sheet, 'Amount at home').element.value).toBe('⅓');
    expect(field(sheet, 'Amount to buy').element.value).toBe('½');

    await field(sheet, 'Amount at home').setValue('1 1/2');
    await field(sheet, 'Amount to buy').setValue('0,25');
    await field(sheet, 'Default amount').setValue('⅔');
    await sheet.get('form').trigger('submit');
    await flushPromises();

    expect(ops.editItem).toHaveBeenCalledWith(
      cream.id,
      expect.objectContaining({ amount: 1.5, to_buy: 0.25, default_amount: 0.666667 })
    );
  });

  it('saves the stored amount for a field left alone, not its rounded text', async () => {
    const { sheet, ops, open } = renderSheet({ id: cream.id });
    await open();
    await sheet.get('form').trigger('submit');
    await flushPromises();

    const [, fields] = ops.editItem.mock.calls[0] as unknown as [ItemId, Record<string, unknown>];
    expect(fields).toMatchObject({ amount: 0.333334, default_amount: 1 });
    expect(fields).not.toHaveProperty('to_buy');
  });

  it('saves zero at home and zero to buy', async () => {
    const { sheet, ops, open } = renderSheet({ id: cream.id });
    await open();
    await field(sheet, 'Amount at home').setValue('0');
    await field(sheet, 'Amount to buy').setValue('0');
    await sheet.get('form').trigger('submit');
    await flushPromises();

    expect(ops.editItem).toHaveBeenCalledWith(cream.id, expect.objectContaining({ amount: 0, to_buy: 0 }));
  });

  it('flags an amount it cannot read and does not save', async () => {
    const { sheet, ops, open } = renderSheet({ id: cream.id });
    await open();
    await field(sheet, 'Amount at home').setValue('a third');

    expect(field(sheet, 'Amount at home').attributes('aria-invalid')).toBe('true');
    expect(sheet.get('[role="alert"]').text()).toContain('1/3');
    expect(saveButton(sheet).attributes('disabled')).toBeDefined();
    await sheet.get('form').trigger('submit');
    await flushPromises();
    expect(ops.editItem).not.toHaveBeenCalled();
  });
});
