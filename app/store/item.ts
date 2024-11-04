import { type Item } from '../../types/Item';

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

  const fetchBuyItems = async () => {
    const { data } = await client.from('items').select().gte('amount_to_purchase', 1).eq('user', user.value.email);
    state.purchasedItems = data;
  };

  const fetchInventoryItems = async () => {
    const { data } = await client.from('items').select().eq('user', user.value.email);
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
  };

  const insertItem = async (data) => {
    const { data: updatedData, error } = await client.from('items').insert({
      amount: data.amount,
      name: data.name,
      amount_type: data.amountType,
      default_amount: data.defaultAmount,
      store: data.store,
      location: data.location,
      user: user.value.email
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
    return state.inventoryItems.filter((item) => item.name.toLowerCase().includes(state.filterInput.toLowerCase()));
  });

  return {
    ...toRefs(state),

    //Actions
    fetchBuyItems,
    fetchInventoryItems,
    addItemToInventory,
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
