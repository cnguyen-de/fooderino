import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'vue-sonner';
import { useRecipeShopping } from '../../app/composables/useRecipeShopping';
import { usePantryAction } from '../../app/composables/usePantryAction';

vi.mock('vue-sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('pantry UI actions', () => {
  it('creates count items from recipe ingredients without reintroducing gram units', async () => {
    const createItem = vi.fn();
    vi.stubGlobal('usePantry', () => ({ search: () => [], ops: { createItem } }));
    await useRecipeShopping().addIngredients([{ name: 'Flour', amount: 500, amount_type: 'gram' }]);
    expect(createItem).toHaveBeenCalledExactlyOnceWith({ name: 'Flour', unit: 'count', to_buy: 500 });
  });

  it('lists exact aliases, creates missing ingredients and leaves stocked items alone', async () => {
    const ops = { addToShopping: vi.fn(), createItem: vi.fn() };
    vi.stubGlobal('usePantry', () => ({
      ops,
      search: (name: string) => {
        if (name === 'Reis') return [{ match: 'exact', via: 'alias', item: { id: 'rice', amount: 0 } }];
        if (name === 'Milk') return [{ match: 'exact', via: 'name', item: { id: 'milk', amount: 2 } }];
        return [{ match: 'fuzzy', via: 'name', item: { id: 'something-else', amount: 0 } }];
      }
    }));
    await useRecipeShopping().addIngredients([
      { name: 'Reis', amount: 2, amount_type: 'gram' },
      { name: 'Milk', amount_type: 'count' },
      { name: 'Eggs', amount_type: 'count' }
    ]);
    expect(ops.addToShopping).toHaveBeenCalledExactlyOnceWith('rice', 2);
    expect(ops.createItem).toHaveBeenCalledExactlyOnceWith({ name: 'Eggs', unit: 'count', to_buy: 1 });
  });

  it('offers undo only for an applied change and uses its exact handle', async () => {
    const undo = vi.fn().mockResolvedValue(null);
    vi.stubGlobal('usePantry', () => ({ ops: { undo } }));
    const act = usePantryAction();
    await act(async () => null, 'Used milk');
    expect(toast).not.toHaveBeenCalled();
    const handle = { commands: [], sheet: null };
    await act(async () => handle, 'Used milk');
    const options = vi.mocked(toast).mock.calls[0]![1]!;
    options.action &&
      typeof options.action !== 'string' &&
      'onClick' in options.action &&
      options.action.onClick?.({} as MouseEvent);
    expect(undo).toHaveBeenCalledWith(handle);
  });

  it('surfaces failed writes without announcing success', async () => {
    vi.stubGlobal('usePantry', () => ({ ops: {} }));
    await usePantryAction()(async () => {
      throw new Error('Not in a household');
    }, 'Saved');
    expect(toast.error).toHaveBeenCalledWith('Not in a household');
    expect(toast).not.toHaveBeenCalled();
  });
});
