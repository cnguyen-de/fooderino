import { BuyList } from './../../.nuxt/components.d';
import { type Item } from '../../types/Item';
import { useListStore } from './list';
import { useSettingsStore } from './settings';

interface State {
  inventoryItems: Item[];
  purchasedItems: Item[];
  selectedItems: string[];
  filterInput: string;
}
export const useItemStore = defineStore('item', () => {
  const state = reactive<State>({
    inventoryItems: [],
    purchasedItems: [],
    selectedItems: [],
    filterInput: ''
  });
  const client = useSupabaseClient();
  const user = useSupabaseUser();
  const listStore = useListStore();
  const settingStore = useSettingsStore();

  const fetchBuyItems = async () => {
    if (!listStore.selectedList) {
      return;
    }
    const { data } = await client
      .from('items')
      .select()
      .gte('amount_to_purchase', 1)
      .eq('list_id', listStore.selectedList?.id);
    state.purchasedItems = data;
  };

  const fetchInventoryItems = async () => {
    if (!listStore.selectedList?.id) {
      return;
    }
    const { data } = await client.from('items').select().gte('amount', 1).eq('list_id', listStore.selectedList?.id);
    state.inventoryItems = data;
  };

  const addItemToInventory = async (item) => {
    const newAmount = item.amount + item.amount_to_purchase;
    const { data } = await client
      .from('items')
      .update({
        amount: newAmount,
        amount_to_purchase: 0
      })
      .eq('id', item.id);
    await fetchInventoryItems();
    await fetchBuyItems();
  };

  const addItemToBuy = async (item) => {
    await client
      .from('items')
      .update({
        amount_to_purchase: item.amount_type === 'g' ? item.amount_to_purchase + 100 : item.amount_to_purchase + 1
      })
      .eq('id', item.id);
    await fetchBuyItems();
    await fetchInventoryItems();
  };

  const insertItem = async (data) => {
    await client.from('items').insert({
      amount: data.amount,
      name: data.name,
      amount_type: data.amountType,
      default_amount: data.defaultAmount,
      amount_to_purchase: data.amountToPurchase ?? data.amount_to_purchase,
      store: data.store?.trim(),
      location: data.location?.trim(),
      user: user.value.email,
      list_id: listStore.selectedList?.id
    });
    await fetchInventoryItems();
    await fetchBuyItems();
  };

  const updateItem = async (data) => {
    const { data: updatedData, error } = await client
      .from('items')
      .update({
        amount: data.amount,
        amount_to_purchase: data.amount_to_purchase,
        name: data.name,
        store: data.store?.trim(),
        location: data.location?.trim()
      })
      .eq('id', data.id);

    await fetchInventoryItems();
    await fetchBuyItems();
  };

  const selectItem = (id: string) => {
    if (isItemSelected(id)) {
      deselectItem(id);
      return;
    }
    state.selectedItems.push(id);
  };

  const deselectItem = (id: string) => {
    const index = state.selectedItems.indexOf(id);
    state.selectedItems.splice(index, 1);
  };

  const deselectAllItems = () => {
    state.selectedItems = [];
  };

  const isItemSelected = (id: string) => {
    return state.selectedItems.includes(id);
  };

  const setFilterInput = (input: string) => {
    state.filterInput = input;
  };

  const getFilteredInventoryItems = computed(() => {
    if (state.filterInput === '' && state.filterInput) {
      return state.inventoryItems;
    }
    return state.inventoryItems?.filter((item) => item.name.toLowerCase().includes(state.filterInput.toLowerCase()));
  });

  const inventoryCategories = computed(() => {
    const cat = getFilteredInventoryItems.value
      ?.filter((item) => (settingStore.settings?.show_empty_items ? true : item.amount > 0))
      .map((item) => item.location.trim());
    return [...new Set(cat)].sort((a, b) => a.localeCompare(b));
  });

  const buyCategories = computed(() => {
    const cat = state.purchasedItems.map((item) => item.store.trim());
    return [...new Set(cat)].sort((a, b) => a.localeCompare(b));
  });

  const deleteItem = async (id: number) => {
    await client.from('items').delete().eq('id', id);
    await fetchInventoryItems();
    await fetchBuyItems();
  };

  const renameCategory = async (oldCategory: string, newCategory: string) => {
    const items = state.inventoryItems.filter((item) => item.location === oldCategory);
    for (const item of items) {
      await client.from('items').update({ location: newCategory }).eq('id', item.id);
    }
    await fetchInventoryItems();
  };

  const allItems = computed(() => {
    return [...state.inventoryItems, ...state.purchasedItems].map((item) => item.name);
  });

  return {
    ...toRefs(state),

    //Actions
    fetchBuyItems,
    fetchInventoryItems,
    addItemToInventory,
    addItemToBuy,
    insertItem,
    updateItem,
    selectItem,
    deselectItem,
    deselectAllItems,
    setFilterInput,
    renameCategory,
    deleteItem,

    //Getters
    isItemSelected,
    getFilteredInventoryItems,
    inventoryCategories,
    buyCategories,
    allItems
  };
});
