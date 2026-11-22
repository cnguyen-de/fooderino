import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { computed, ref, shallowRef } from 'vue';
import { toast } from 'vue-sonner';
import type { HouseholdId, Item, ItemId, LocalDate } from '~~/types/pantry';
import type { Cook } from '../../app/composables/useCook';
import { dateText } from '../../app/utils/cook-format';
import { db } from '~~/utils/db';
import { createPantryOps } from '~~/utils/pantry-ops';
import { setSyncState } from '~~/utils/sync-state';

vi.mock('vue-sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

const TODAY = '2026-11-22' as LocalDate;
const YESTERDAY = '2026-11-21' as LocalDate;
const OLDER = '2026-11-15' as LocalDate;

const ops = createPantryOps({ db });
const items = shallowRef<ReadonlyMap<ItemId, Item>>(new Map());
let cook: Cook;

beforeAll(async () => {
  vi.stubGlobal('shallowRef', shallowRef);
  vi.stubGlobal('computed', computed);
  vi.stubGlobal('usePantry', () => ({
    view: computed(() => ({ byId: (id: ItemId) => items.value.get(id), home: { useSoon: [] } })),
    search: () => [],
    today: ref(TODAY),
    ops,
    ready: ref(true)
  }));
  await setSyncState(db, { household_id: '00000000-0000-4000-8000-0000000000f1' as HouseholdId });
  const { useCook } = await import('../../app/composables/useCook');
  cook = useCook();
});

afterEach(() => vi.clearAllMocks());

const lastToast = () => vi.mocked(toast).mock.calls.at(-1)?.[0];
const salt = { name: 'Salt', item_id: null, amount: '', unit: 'count' } as const;

describe('adding to a meal names the meal as its card does', () => {
  it.each([
    [TODAY, 'Added Salt to today'],
    [YESTERDAY, "Added Salt to yesterday's meal"],
    [OLDER, `Added Salt to ${dateText(OLDER, TODAY)}`]
  ])('an ingredient on %s', async (date, text) => {
    expect(await cook.addIngredient(date, { ...salt })).toBe(true);
    expect(lastToast()).toBe(text);
  });

  it('names an older day by weekday and date, never as an ISO date', async () => {
    await cook.addIngredient(OLDER, { ...salt });
    expect(lastToast()).toMatch(/^Added Salt to Sun, (15 Nov|Nov 15)$/);
  });

  it.each([
    [TODAY, 'Added Pho to today'],
    [YESTERDAY, "Added Pho to yesterday's meal"],
    [OLDER, `Added Pho to ${dateText(OLDER, TODAY)}`]
  ])('a dish on %s', async (date, text) => {
    const recipe = (await cook.saveRecipe({ name: 'Pho', kind: 'soup', ingredients: [], instructions: '' }))!;
    await vi.waitFor(() => expect(cook.recipe(recipe)).toBeDefined());

    expect(await cook.addToMeal(recipe, date, [])).toBe(true);
    expect(lastToast()).toBe(text);
  });
});
