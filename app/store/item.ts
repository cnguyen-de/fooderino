import { type Item } from '../../types/Item';

interface State {
  inventoryItems: Item[];
  purchasedItems: Item[];
}
export const useItemStore = defineStore('item', () => {
  const state = reactive<State>({
    inventoryItems: [],
    purchasedItems: []
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

  return {
    ...toRefs(state),

    //Actions
    fetchBuyItems,
    fetchInventoryItems,
    addItemToInventory,
    insertItem,
    updateItem

    //Getters
  };
});
