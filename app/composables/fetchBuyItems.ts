export const fetchBuyItems = async () => {
  const client = useSupabaseClient();
  const { data } = await client.from("items").select().gte("amount_to_purchase", 1);
  return data;
};
