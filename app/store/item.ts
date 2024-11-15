import { type Item } from '../../types/Item';
import { useListStore } from './list';

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

  const fetchBuyItems = async () => {
    state.inventoryItems = [];

    if (!listStore.selectedList) {
      await listStore.fetchLists();
    }
    const { data } = await client
      .from('items')
      .select()
      .gte('amount_to_purchase', 1)
      .eq('list_id', listStore.selectedList?.id);
    state.purchasedItems = data;
  };

  const fetchInventoryItems = async () => {
    state.inventoryItems = [];
    if (!listStore.selectedList) {
      await listStore.fetchLists();
    }
    const { data } = await client.from('items').select().eq('list_id', listStore.selectedList?.id);
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
    const { data: updatedData, error } = await client.from('items').insert({
      amount: data.amount,
      name: data.name,
      amount_type: data.amountType,
      default_amount: data.defaultAmount,
      amount_to_purchase: data.amountToPurchase,
      store: data.store,
      location: data.location,
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
        store: data.store,
        location: data.location
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

  // TODO Implement UI
  const deleteItem = async (id: string) => {
    await client.from('items').delete().eq('id', id);
    await fetchInventoryItems();
    await fetchBuyItems();
  };

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

    //Getters
    isItemSelected,
    getFilteredInventoryItems
  };
});
