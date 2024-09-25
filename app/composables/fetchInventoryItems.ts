export const fetchInventoryItems = async () => {
  const client = useSupabaseClient();
  const { data } = await client.from('items').select();
  return data;
};
