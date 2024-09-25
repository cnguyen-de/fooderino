export const addItemToInventory = async (item) => {
  const client = useSupabaseClient();
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
