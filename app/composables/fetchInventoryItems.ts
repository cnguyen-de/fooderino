export const fetchInventoryItems = async () => {
  const client = useSupabaseClient();
  const user = useSupabaseUser();
  const { data } = await client.from('items').select().eq('user', user.value.email);
  return data;
};
