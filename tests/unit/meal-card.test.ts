import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
import type { CommandId, ItemId, LocalDate, PantryItem } from '~~/types/pantry';
import type { CookedId, MealIngredientId, RecipeId } from '~~/types/cook';
import {
  checkIngredient,
  mealNeeds,
  type Meal,
  type MealDish,
  type MealIngredient,
  type RecipeView
} from '~~/utils/cook';
import MealCard from '../../app/components/cook/MealCard.vue';
import CookSheet from '../../app/components/cook/CookSheet.vue';
import IngredientSheet from '../../app/components/cook/IngredientSheet.vue';
import RecipePicker from '../../app/components/cook/RecipePicker.vue';

const TODAY = '2026-11-18' as LocalDate;
const OLD = '2026-11-15' as LocalDate;

const tofu = {
  id: 'tofu' as ItemId,
  name: 'Tofu',
  unit: 'count',
  amount: 1,
  aliases: [],
  tags: []
} as unknown as PantryItem;

const soup = {
  id: '00000000-0000-4000-8000-0000000000a1' as RecipeId,
  name: 'Canh chua',
  kind: 'soup',
  ingredients: [],
  ingredientsAtHome: []
} as unknown as RecipeView;

const dish: MealDish = {
  id: '00000000-0000-4000-8000-0000000000c1' as CookedId,
  recipe: { id: soup.id, name: 'Canh chua', kind: 'soup', deleted: false },
  uses: []
};

const entry = (name: string, qty: MealIngredient['ingredient']['qty'], uses: string[] = []): MealIngredient => ({
  id: `00000000-0000-4000-8000-${String(Math.random()).slice(2, 14).padEnd(12, '0')}` as MealIngredientId,
  ingredient: { name, item_id: null, qty },
  uses: uses as CommandId[]
});

const lookup = { byId: (id: ItemId) => (id === tofu.id ? tofu : undefined), search: () => [] };

function renderCard(meal: Partial<Meal> & { date: LocalDate }, title = 'Sat, 15 Nov') {
  const cook = {
    removeDish: vi.fn(async () => true),
    removeIngredient: vi.fn(async () => true),
    addIngredient: vi.fn(async () => true),
    checkIngredient: vi.fn((draft) => checkIngredient(draft, lookup)),
    findRecipes: (q: string) => (q.trim() ? [soup] : []),
    recipe: (id: RecipeId) => (id === soup.id ? soup : undefined),
    plan: () => [],
    check: () => ({ ok: true, uses: [] })
  };
  vi.stubGlobal('useCook', () => cook);
  vi.stubGlobal('usePantry', () => ({ view: ref({ byId: lookup.byId }), today: ref(TODAY), search: () => [] }));
  const passthrough = { template: '<div><slot /></div>' };
  const card = mount(MealCard, {
    props: { meal: { dishes: [], ingredients: [], needs: mealNeeds(meal.dishes ?? []), ...meal }, title },
    global: {
      components: { CookSheet, IngredientSheet, RecipePicker },
      stubs: {
        Drawer: { props: ['open'], template: '<div v-if="open" role="dialog"><slot /></div>' },
        DrawerContent: passthrough,
        DrawerHeader: passthrough,
        DrawerTitle: { template: '<h3><slot /></h3>' },
        DrawerDescription: { template: '<p><slot /></p>' },
        Button: { template: '<button type="button"><slot /></button>' },
        Input: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
        },
        ItemCombobox: {
          props: ['modelValue'],
          emits: ['update:modelValue', 'pick'],
          setup: () => ({ tofu }),
          template:
            '<span><input aria-label="Ingredient" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /><button type="button" @click="$emit(\'pick\', tofu)">Pick Tofu</button></span>'
        },
        NuxtLink: { template: '<a><slot /></a>' },
        KindBadge: true,
        StockBadge: true
      }
    }
  });
  return { card, cook };
}

const button = (card: ReturnType<typeof mount>, text: string) => {
  const found = card.findAll('button').find((b) => b.text() === text);
  if (!found) throw new Error(`no button "${text}" in: ${card.text()}`);
  return found;
};
const dialog = (card: ReturnType<typeof mount>) => card.get('[role="dialog"]');

afterEach(() => vi.unstubAllGlobals());

describe('meal card ingredients', () => {
  it('lists ingredients under the dishes with their amount, or "some" when none was counted', () => {
    const { card } = renderCard({
      date: OLD,
      dishes: [dish],
      ingredients: [entry('Tofu', { amount: 0.5, unit: 'count' }), entry('Salt', null)]
    });

    const rows = card.findAll('li').map((li) => li.text());
    expect(rows).toEqual(['Canh chua', 'Tofu½', 'Saltsome']);
    expect(card.text()).not.toContain('Nothing cooked yet');
  });

  it('shows a meal of only ingredients, still asking for a soup and two dishes', () => {
    const { card } = renderCard({ date: OLD, ingredients: [entry('Beef', { amount: 250, unit: 'gram' })] });

    expect(card.text()).toContain('250 g');
    expect(card.text()).toContain('Add a soup and 2 more dishes');
  });

  it('removes an ingredient and puts it back, from an older meal too', async () => {
    const tofuUsed = entry('Tofu', { amount: 0.5, unit: 'count' }, ['00000000-0000-4000-8000-0000000000e1']);
    const { card, cook } = renderCard({ date: OLD, ingredients: [tofuUsed] });

    await card.get('button[aria-label="Tofu, options"]').trigger('click');
    expect(dialog(card).text()).toContain('Remove, keep stock as is');
    await button(card, 'Remove and put it back').trigger('click');
    await flushPromises();

    expect(cook.removeIngredient).toHaveBeenCalledWith(tofuUsed.id, { restock: true });
    expect(card.find('[role="dialog"]').exists()).toBe(false);
  });

  it('offers only removal for an ingredient that took nothing from home', async () => {
    const salt = entry('Salt', null);
    const { card, cook } = renderCard({ date: OLD, ingredients: [salt] });

    await card.get('button[aria-label="Salt, options"]').trigger('click');
    expect(dialog(card).text()).not.toContain('put it back');
    await button(card, 'Remove from meal').trigger('click');

    expect(cook.removeIngredient).toHaveBeenCalledWith(salt.id, { restock: false });
  });
});

describe('adding to an older meal', () => {
  it('adds an ingredient dated to that meal', async () => {
    const { card, cook } = renderCard({ date: OLD });

    await button(card, 'Add ingredient').trigger('click');
    await button(card, 'Pick Tofu').trigger('click');
    await card.get('input[aria-label="Amount used"]').setValue('1/2');
    expect(dialog(card).text()).toContain('Takes ½ Tofu from home');
    await card.get('form').trigger('submit');
    await flushPromises();

    expect(cook.addIngredient).toHaveBeenCalledWith(
      OLD,
      expect.objectContaining({ name: 'Tofu', item_id: tofu.id, amount: '1/2' })
    );
  });

  it('opens the cook sheet for a picked recipe with the date of that meal', async () => {
    const { card } = renderCard({ date: OLD });

    await button(card, 'Add dish').trigger('click');
    await card.get('input[aria-label="Find a recipe"]').setValue('canh');
    await card
      .findAll('button')
      .find((b) => b.text().includes('Canh chua'))!
      .trigger('click');
    await flushPromises();

    expect(card.text()).toContain('Cook Canh chua');
    expect(card.get<HTMLInputElement>('input[aria-label="Meal date"]').element.value).toBe(OLD);
  });
});

describe('add ingredient sheet', () => {
  async function openSheet() {
    const rendered = renderCard({ date: TODAY }, 'Today');
    await button(rendered.card, 'Add ingredient').trigger('click');
    return rendered;
  }
  const submit = (card: ReturnType<typeof mount>) => card.findAll('button').find((b) => b.text() === 'Add to meal')!;
  const alert = (card: ReturnType<typeof mount>) => card.find('[role="alert"]');

  it('refuses more than is at home, and lets a part of the last one through', async () => {
    const { card, cook } = await openSheet();
    await button(card, 'Pick Tofu').trigger('click');

    await card.get('input[aria-label="Amount used"]').setValue('2');
    expect(alert(card).text()).toContain('Only 1 Tofu at home');
    expect(submit(card).attributes('disabled')).toBeDefined();
    await card.get('form').trigger('submit');
    await flushPromises();
    expect(cook.addIngredient).not.toHaveBeenCalled();

    await card.get('input[aria-label="Amount used"]').setValue('0.995');
    expect(alert(card).exists()).toBe(false);
    expect(submit(card).attributes('disabled')).toBeUndefined();
  });

  it('flags an amount it cannot read', async () => {
    const { card } = await openSheet();
    await button(card, 'Pick Tofu').trigger('click');
    await card.get('input[aria-label="Amount used"]').setValue('half');

    expect(card.get('input[aria-label="Amount used"]').attributes('aria-invalid')).toBe('true');
    expect(alert(card).text()).toContain('1/3');
    expect(submit(card).attributes('disabled')).toBeDefined();
  });

  it('records a blank or zero amount without taking anything from home', async () => {
    const { card, cook } = await openSheet();
    await card.get('input[aria-label="Ingredient"]').setValue('Salt');
    expect(dialog(card).text()).toContain('Records it without taking anything from home');

    await card.get('input[aria-label="Amount used"]').setValue('0');
    expect(dialog(card).text()).toContain('Records it without taking anything from home');
    await card.get('form').trigger('submit');
    await flushPromises();

    expect(cook.addIngredient).toHaveBeenCalledWith(
      TODAY,
      expect.objectContaining({ name: 'Salt', item_id: null, amount: '0' })
    );
  });

  it('keeps save off until something is picked or typed, without an error', async () => {
    const { card } = await openSheet();

    expect(submit(card).attributes('disabled')).toBeDefined();
    expect(alert(card).exists()).toBe(false);
  });
});
