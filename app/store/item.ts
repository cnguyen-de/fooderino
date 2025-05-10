import { BuyList } from './../../.nuxt/components.d';
import { type Item } from '../../types/Item';
import { useListStore } from './list';
import { useSettingsStore } from './settings';
import { useLogStore } from './logs';

interface State {
  inventoryItems: Item[];
  buyItems: Item[];
  selectedItems: string[];
  filterInput: string;
  allItems: Item[];
  showBuyItemsFromAllLists: boolean;
  buyItemsFromAllLists: Item[];
}
export const useItemStore = defineStore('item', () => {
  const state = reactive<State>({
    inventoryItems: [],
    buyItems: [],
    selectedItems: [],
    filterInput: '',
    allItems: [],
    showBuyItemsFromAllLists: false,
    buyItemsFromAllLists: []
  });
  const client = useSupabaseClient();
  const user = useSupabaseUser();
  const listStore = useListStore();
  const settingStore = useSettingsStore();
  const logStore = useLogStore();

  const fetchItems = async () => {
    if (state.showBuyItemsFromAllLists) {
      await fetchBuyItemsFromAllLists();
    }
    if (!listStore.selectedList) {
      return;
    }
    const { data } = await client.from('items').select().eq('list_id', listStore.selectedList?.id);
    state.inventoryItems = data.filter((item) => item.amount > 0);
    state.buyItems = data.filter((item) => item.amount_to_purchase > 0);
    state.allItems = data;
  };

  const fetchBuyItems = async () => {
    if (!listStore.selectedList) {
      return;
    }
    const { data } = await client
      .from('items')
      .select()
      .gte('amount_to_purchase', 1)
      .eq('list_id', listStore.selectedList?.id);
    state.buyItems = data;
  };

  const fetchBuyItemsFromAllLists = async () => {
    const allLists = listStore.lists;
    const lists = allLists.map((list) => list.id);
    const query = lists.map((list) => `list_id.eq.${list}`).join(',');
    const { data } = await client.from('items').select().gte('amount_to_purchase', 1).or(query);
    state.buyItemsFromAllLists = data;
  };

  const fetchInventoryItems = async () => {
    if (!listStore.selectedList?.id) {
      return;
    }
    const { data } = await client.from('items').select().gte('amount', 1).eq('list_id', listStore.selectedList?.id);
    state.inventoryItems = data;
  };

  const addItemToInventory = async (item) => {
    let newAmount = 0;
    if (!useNoInventoryMode()) {
      newAmount = item.amount + item.amount_to_purchase;
    }

    const { data } = await client
      .from('items')
      .update({
        amount: newAmount,
        amount_to_purchase: 0,
        times_updated: item.times_updated + 1,
        last_updated: new Date().toISOString()
      })
      .eq('id', item.id);

    await fetchItems();
    logStore.insertLog(listStore.selectedList?.id, user.value.email, item.name);
  };

  const addItemToBuy = async (item) => {
    await client
      .from('items')
      .update({
        amount_to_purchase: item.amount_type === 'g' ? item.amount_to_purchase + 100 : item.amount_to_purchase + 1,
        times_updated: item.times_updated + 1,
        last_updated: new Date().toISOString()
      })
      .eq('id', item.id);
    logStore.insertLog(listStore.selectedList?.id, user.value.email, item.name);
    await fetchItems();
  };

  const insertItem = async (data) => {
    if (allItemNames.value?.includes(data?.name)) {
      const existingItem = state.allItems.find((item) => item.name === data.name);
      existingItem.amount_to_purchase = data.amountToPurchase ?? data.amount_to_purchase;
      existingItem.default_amount = data.defaultAmount;
      existingItem.amount_type = data.amountType;
      existingItem.times_updated = data.times_updated + 1;
      await updateItem({ ...existingItem, ...data });
      return;
    }
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
    logStore.insertLog(listStore.selectedList?.id, user.value.email, data.name);
    await fetchItems();
  };

  const updateItem = async (data) => {
    const { data: updatedData, error } = await client
      .from('items')
      .update({
        amount: data.amount,
        amount_to_purchase: data.amount_to_purchase,
        default_amount: data.default_amount,
        name: data.name,
        store: data.store?.trim(),
        location: data.location?.trim(),
        times_updated: data.times_updated + 1,
        last_updated: new Date().toISOString()
      })
      .eq('id', data.id);
    logStore.insertLog(listStore.selectedList?.id, user.value.email, data.name);
    await fetchItems();
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
    return state.inventoryItems?.filter((item) => item.name.toLowerCase()?.includes(state.filterInput.toLowerCase()));
  });

  const getFilteredShoppingItems = computed(() => {
    if (state.filterInput === '' && state.filterInput) {
      return state.buyItems;
    }
    return state.buyItems?.filter((item) => item.name.toLowerCase()?.includes(state.filterInput.toLowerCase()));
  });

  const getFilteredAllBuyItems = computed(() => {
    if (state.filterInput === '' && state.filterInput) {
      return state.buyItemsFromAllLists;
    }
    return state.buyItemsFromAllLists?.filter((item) =>
      item.name.toLowerCase()?.includes(state.filterInput.toLowerCase())
    );
  });

  const inventoryCategories = computed(() => {
    const cat = getFilteredInventoryItems.value
      ?.filter((item) => (settingStore.settings?.show_empty_items ? true : item.amount > 0))
      .map((item) => item.location.trim());
    return [...new Set(cat)].sort((a, b) => a.localeCompare(b));
  });

  const allCategories = computed(() => {
    const cat = state.allItems.map((item) => item.location.trim());
    return [...new Set(cat)].sort((a, b) => a.localeCompare(b));
  });

  const buyCategories = computed(() => {
    const cat = state.buyItems.map((item) => item.store.trim());
    return [...new Set(cat)].sort((a, b) => a.localeCompare(b));
  });

  const deleteItem = async (id: number) => {
    const itemName = state.allItems.find((item) => item.id === id)?.name;
    logStore.insertLog(listStore.selectedList?.id, user.value.email, itemName);
    await client.from('items').delete().eq('id', id);
    await fetchItems();
  };

  const renameCategory = async (oldCategory: string, newCategory: string) => {
    const items = state.inventoryItems.filter((item) => item.location === oldCategory);
    for (const item of items) {
      await client.from('items').update({ location: newCategory }).eq('id', item.id);
    }
    await fetchItems();
  };

  const renameStore = async (oldStore: string, newStore: string) => {
    const items = state.buyItems.filter((item) => item.store === oldStore);
    for (const item of items) {
      await client.from('items').update({ store: newStore }).eq('id', item.id);
    }
    await fetchItems();
  };

  const allItemNames = computed(() => {
    return state.allItems.map((item) => item.name);
  });

  return {
    ...toRefs(state),

    //Actions
    fetchItems,
    fetchBuyItems,
    fetchBuyItemsFromAllLists,
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
    renameStore,
    deleteItem,

    //Getters
    isItemSelected,
    getFilteredInventoryItems,
    getFilteredShoppingItems,
    getFilteredAllBuyItems,
    inventoryCategories,
    buyCategories,
    allItemNames,
    allCategories
  };
});
