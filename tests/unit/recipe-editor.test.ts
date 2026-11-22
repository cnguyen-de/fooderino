import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { RecipeId } from '~~/types/cook';
import RecipeEditor from '../../app/components/cook/RecipeEditor.vue';

function renderEditor() {
  const saveRecipe = vi.fn(async () => 'r1' as RecipeId);
  vi.stubGlobal('useCook', () => ({ saveRecipe }));
  vi.stubGlobal('useRouter', () => ({ replace: vi.fn(), back: vi.fn() }));
  const editor = mount(RecipeEditor, {
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
