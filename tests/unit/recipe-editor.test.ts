import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { RecipeId, RecipeView } from '~/composables/useCook';
import RecipeEditor from '../../app/components/cook/RecipeEditor.vue';

function renderEditor(recipe?: RecipeView) {
  const saveRecipe = vi.fn(async () => 'r1' as RecipeId);
  vi.stubGlobal('useCook', () => ({ saveRecipe }));
  vi.stubGlobal('useRouter', () => ({ replace: vi.fn(), back: vi.fn() }));
  const editor = mount(RecipeEditor, {
    props: { recipe },
    global: {
      stubs: {
        ItemCombobox: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<input aria-label="Ingredient" @input="$emit(\'update:modelValue\', $event.target.value)" />'
        },
        Input: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
        },
        Button: { template: '<button><slot /></button>' },
        Textarea: true
      }
    }
  });
  return { editor, saveRecipe };
}

const amount = (editor: ReturnType<typeof mount>) =>
  editor.get<HTMLInputElement>('input[aria-label="Amount of ingredient 1"]');
const chip = (editor: ReturnType<typeof mount>, glyph: string) =>
  editor.findAll('[role="group"] button').find((b) => b.text() === glyph);

afterEach(() => vi.unstubAllGlobals());

describe('recipe editor amounts', () => {
  it('offers fraction chips for a piece amount once it is focused, and saves the fraction picked', async () => {
    const { editor, saveRecipe } = renderEditor();
    await editor.get('input[placeholder="Canh chua"]').setValue('Sauce');
    await editor.get('input[aria-label="Ingredient"]').setValue('Cream');
    expect(chip(editor, '½')).toBeUndefined();

    await amount(editor).trigger('focus');
    await chip(editor, '½')!.trigger('click');
    expect(amount(editor).element.value).toBe('½');
    await editor.get('form').trigger('submit');
    await flushPromises();

    expect(saveRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ ingredients: [expect.objectContaining({ qty: { amount: 0.5, unit: 'count' } })] })
    );
  });

  it('hides the chips for grams', async () => {
    const { editor } = renderEditor();
    await amount(editor).trigger('focus');
    expect(chip(editor, '⅓')).toBeDefined();
    await editor.get('select[aria-label="Unit of ingredient 1"]').setValue('gram');
    expect(chip(editor, '⅓')).toBeUndefined();
  });

  it('flags an amount it cannot read and does not save', async () => {
    const { editor, saveRecipe } = renderEditor();
    await editor.get('input[placeholder="Canh chua"]').setValue('Sauce');
    await amount(editor).setValue('half');

    expect(amount(editor).attributes('aria-invalid')).toBe('true');
    expect(editor.get('[role="alert"]').text()).toContain('1/3');
    await editor.get('form').trigger('submit');
    await flushPromises();
    expect(saveRecipe).not.toHaveBeenCalled();
  });
});

describe('recipe editor kind', () => {
  const kinds = (editor: ReturnType<typeof mount>) =>
    editor.findAll('[role="radiogroup"][aria-label="Kind"] [role="radio"]').map((b) => ({
      label: b.text(),
      checked: b.attributes('aria-checked') === 'true'
    }));

  it('offers a dish, a soup or a one-dish meal, and saves a one-dish meal picked', async () => {
    const { editor, saveRecipe } = renderEditor();
    expect(kinds(editor)).toEqual([
      { label: 'Dish', checked: true },
      { label: 'Soup', checked: false },
      { label: 'One-dish', checked: false }
    ]);

    await editor.get('input[placeholder="Canh chua"]').setValue('Pho');
    await editor
      .findAll('[role="radio"]')
      .find((b) => b.text() === 'One-dish')!
      .trigger('click');
    await editor.get('form').trigger('submit');
    await flushPromises();

    expect(saveRecipe).toHaveBeenCalledWith(expect.objectContaining({ name: 'Pho', kind: 'whole_meal' }));
  });

  it('opens a one-dish recipe with One-dish picked', () => {
    const pho = {
      id: 'r1',
      name: 'Pho',
      kind: 'whole_meal',
      ingredients: [],
      instructions: ''
    } as unknown as RecipeView;
    const { editor } = renderEditor(pho);
    expect(kinds(editor).find((k) => k.checked)?.label).toBe('One-dish');
  });
});
