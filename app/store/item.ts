import { useListStore } from './list';
import { useLogStore } from './logs';
import type { ItemRecord } from '~~/types/sync';

interface State {
  selectedItems: string[];
  filterInput: string;
  showBuyItemsFromAllLists: boolean;
}

/** Form inputs bind to strings, so every numeric field arrives as text. */
const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const useItemStore = defineStore('item', () => {
  const state = reactive<State>({
    selectedItems: [],
    filterInput: '',
    showBuyItemsFromAllLists: false
  });

  const listStore = useListStore();
  const logStore = useLogStore();

  const listId = computed(() => listStore.selectedList?.id ?? null);
  const repo = useItems(listId);
  // Unscoped: the shopping page works across every list, so lookups by id must
  // not be confined to the selected one or they silently find nothing.
  const allRepo = useItems();

  const findItem = (id: string): ItemRecord | undefined => allRepo.items.value.find((i) => i.id === id);

  const matchesFilter = (name: string) => name.toLowerCase().includes(state.filterInput.toLowerCase());

  const getFilteredInventoryItems = computed(() => repo.inventoryItems.value.filter((i) => matchesFilter(i.name)));
  const getFilteredShoppingItems = computed(() => repo.buyItems.value.filter((i) => matchesFilter(i.name)));
  const getFilteredAllBuyItems = computed(() => allRepo.buyItems.value.filter((i) => matchesFilter(i.name)));

  const addItemToBuy = async (item: ItemRecord) => {
    // The production `AmountType` enum is gram | kg | count — there has never
    // been a 'g', so the legacy comparison meant grams incremented by 1.
    await repo.addDelta(item, 'amount_to_purchase', item.amount_type === 'gram' ? 100 : 1);
  };

  const addItemToInventory = async (item: ItemRecord) => {
    const moved = num(item.amount_to_purchase);
    await repo.addDelta(item, 'amount', moved);
    await repo.setAmount(item, 'amount_to_purchase', 0);

    const before = num(item.amount);
    await logStore.insertLog(item.name, 'updated', `${before} → ${before + moved}`);
  };

  const insertItem = async (data: any) => {
    if (!listId.value) return;

    const amountType = data.amountType ?? data.amount_type ?? 'count';
    const defaultAmount = num(data.defaultAmount ?? data.default_amount ?? 1);
    const wanted = num(data.amountToPurchase ?? data.amount_to_purchase ?? 0);

    const existing = repo.items.value.find((i) => i.name === data.name);
    if (existing) {
      await repo.update(existing.id, {
        location: data.location?.trim(),
        store: data.store?.trim(),
        amount_type: amountType,
        default_amount: defaultAmount
      });
      if (wanted) await repo.setAmount(existing, 'amount_to_purchase', wanted);
      return;
    }

    await repo.create({
      list_id: listId.value,
      name: data.name,
      location: data.location ?? '',
      store: data.store ?? '',
      amount_type: amountType,
      default_amount: defaultAmount,
      amount: num(data.amount ?? 0),
      amount_to_purchase: wanted
    });
    await logStore.insertLog(data.name, 'created', '');
  };

  /**
   * `data` is often a partial payload — `Item.vue` emits a spread of its own
   * props, which carries no location or store — so undefined fields are left
   * to `repo.update`, which drops them rather than blanking the record.
   */
  const updateItem = async (data: any) => {
    const item = findItem(data.id);
    if (!item) return;

    await repo.update(item.id, {
      name: data.name,
      location: data.location?.trim(),
      store: data.store?.trim(),
      default_amount: data.default_amount === undefined ? undefined : num(data.default_amount),
      amount_type: data.amount_type
    });

    if (data.amount !== undefined && num(data.amount) !== item.amount) {
      await repo.setAmount(item, 'amount', num(data.amount));
      await logStore.insertLog(data.name ?? item.name, 'updated', `${item.amount} → ${num(data.amount)}`);
    }
    if (data.amount_to_purchase !== undefined && num(data.amount_to_purchase) !== item.amount_to_purchase) {
      await repo.setAmount(item, 'amount_to_purchase', num(data.amount_to_purchase));
    }
  };

  const deleteItem = async (id: string) => {
    const item = findItem(id);
    await repo.remove(id);
    if (item) await logStore.insertLog(item.name, 'deleted', '');
  };

  const renameCategory = async (oldCategory: string, newCategory: string) => {
    for (const item of repo.items.value.filter((i) => i.location === oldCategory)) {
      await repo.update(item.id, { location: newCategory });
    }
  };

  const renameStore = async (oldStore: string, newStore: string) => {
    for (const item of repo.items.value.filter((i) => i.store === oldStore)) {
      await repo.update(item.id, { store: newStore });
    }
  };

  const selectItem = (id: string) => {
    const i = state.selectedItems.indexOf(id);
    if (i > -1) state.selectedItems.splice(i, 1);
    else state.selectedItems.push(id);
  };
  const deselectAllItems = () => {
    state.selectedItems = [];
  };
  const isItemSelected = (id: string) => state.selectedItems.includes(id);
  const setFilterInput = (input: string) => {
    state.filterInput = input;
  };

  const uniqueSorted = (values: string[]) =>
    [...new Set(values.map((v) => v.trim()))].sort((a, b) => a.localeCompare(b));

  const inventoryCategories = computed(() =>
    uniqueSorted(getFilteredInventoryItems.value.filter((i) => i.amount > 0).map((i) => i.location))
  );
  const allCategories = computed(() => uniqueSorted(repo.items.value.map((i) => i.location)));
  const buyCategories = computed(() => uniqueSorted(getFilteredShoppingItems.value.map((i) => i.store)));
  const allItemNames = computed(() => repo.items.value.map((i) => i.name));

  return {
    ...toRefs(state),
    inventoryItems: repo.inventoryItems,
    buyItems: repo.buyItems,
    allItems: repo.items,
    buyItemsFromAllLists: allRepo.buyItems,

    //Actions
    addItemToInventory,
    addItemToBuy,
    insertItem,
    updateItem,
    deleteItem,
    selectItem,
    deselectAllItems,
    setFilterInput,
    renameCategory,
    renameStore,

    //Getters
    isItemSelected,
    getFilteredInventoryItems,
    getFilteredShoppingItems,
    getFilteredAllBuyItems,
    inventoryCategories,
    buyCategories,
    allCategories,
    allItemNames
  };
});
