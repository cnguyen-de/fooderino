import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import type { RecipeKind } from '~~/types/cook';
import type { LocalDate } from '~~/types/pantry';
import type { RecipeView } from '~~/utils/cook';
import RecipeList from '../../app/pages/cook/recipes/index.vue';
import KindBadge from '../../app/components/cook/KindBadge.vue';

const recipe = (name: string, kind: RecipeKind) =>
  ({ id: name, name, kind, ingredients: [], lastEaten: null }) as unknown as RecipeView;

function renderList() {
  vi.stubGlobal('useCook', () => ({
    recipes: ref([recipe('Canh chua', 'soup'), recipe('Ga xao', 'dish'), recipe('Pho', 'whole_meal')]),
    today: ref('2026-11-18' as LocalDate),
    ready: ref(true)
  }));
  const passthrough = { template: '<div><slot /></div>' };
  return mount(RecipeList, {
    global: {
      components: { KindBadge },
      stubs: {
        NuxtLayout: passthrough,
        NuxtLink: { template: '<a><slot /></a>' },
        Button: passthrough,
        CookNav: true,
        Input: true,
        StockBadge: true
      }
    }
  });
}

const rows = (list: ReturnType<typeof mount>) =>
  list
    .findAll('a')
    .map((a) => a.text())
    .filter((t) => t.includes('Never eaten'));

afterEach(() => vi.unstubAllGlobals());

describe('recipe list', () => {
  it('labels each recipe with its kind', () => {
    expect(rows(renderList())).toEqual(['Canh chuaSoupNever eaten', 'Ga xaoDishNever eaten', 'PhoOne-dishNever eaten']);
  });

  it('filters to one-dish meals', async () => {
    const list = renderList();
    const filters = list.findAll('[role="radiogroup"][aria-label="Kind"] [role="radio"]');
    expect(filters.map((b) => b.text())).toEqual(['All', 'Dish', 'Soup', 'One-dish']);

    await filters[3]!.trigger('click');
    expect(rows(list)).toEqual(['PhoOne-dishNever eaten']);
  });
});
