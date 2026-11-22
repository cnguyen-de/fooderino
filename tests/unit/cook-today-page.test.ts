import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import type { CookedId, MealIngredientId, RecipeId } from '~~/types/cook';
import type { LocalDate } from '~~/types/pantry';
import { mealNeeds, type Meal, type MealDish, type MealIngredient } from '~~/utils/cook';
import CookToday from '../../app/pages/cook/index.vue';
import MealCard from '../../app/components/cook/MealCard.vue';

const TODAY = '2026-11-18' as LocalDate;

const omelette: MealDish = {
  id: '00000000-0000-4000-8000-0000000000c1' as CookedId,
  recipe: { id: '00000000-0000-4000-8000-0000000000a1' as RecipeId, name: 'Omelette', kind: 'dish', deleted: true },
  uses: []
};

function renderToday(dishes: MealDish[], ingredients: MealIngredient[] = []) {
  const todayMeal = ref<Meal>({ date: TODAY, dishes, ingredients, needs: mealNeeds(dishes) });
  vi.stubGlobal('useCook', () => ({
    recipes: ref([]),
    todayMeal,
    suggestions: ref({ soups: [], dishes: [] }),
    today: ref(TODAY),
    ready: ref(true),
    recipe: () => undefined,
    findRecipes: () => [],
    removeDish: vi.fn()
  }));
  const passthrough = { template: '<div><slot /></div>' };
  return mount(CookToday, {
    global: {
      components: { MealCard },
      stubs: {
        NuxtLayout: passthrough,
        NuxtLink: { template: '<a><slot /></a>' },
        Button: passthrough,
        CookNav: true,
        CookSheet: true,
        Drawer: true,
        DrawerContent: true,
        DrawerHeader: true,
        DrawerTitle: true,
        DrawerDescription: true,
        Input: true,
        KindBadge: true,
        StockBadge: true
      }
    }
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('Cook Today page', () => {
  it('keeps today’s meal on screen after its last recipe was deleted', () => {
    const page = renderToday([omelette]);

    expect(page.text()).toContain('Omelette');
    expect(page.text()).not.toContain('Add your first recipe');
  });

  it('shows today’s meal when it holds only an ingredient and there are no recipes', () => {
    const salt: MealIngredient = {
      id: '00000000-0000-4000-8000-0000000000d1' as MealIngredientId,
      ingredient: { name: 'Salt', item_id: null, qty: null },
      uses: []
    };
    const page = renderToday([], [salt]);

    expect(page.text()).toContain('Salt');
    expect(page.text()).not.toContain('Add your first recipe');
  });

  it('invites the first recipe under today\'s meal, which can still take an ingredient', () => {
    const page = renderToday([]);

    expect(page.text()).toContain('Add your first recipe');
    expect(page.text()).toContain('Add ingredient');
  });
});
