export const fetchBuyItems = async () => {
  const client = useSupabaseClient();
  const user = useSupabaseUser();
  const { data } = await client.from('items').select().gte('amount_to_purchase', 1).eq('user', user.value.email);

  return data;
};
