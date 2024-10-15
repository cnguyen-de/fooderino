export const updateItems = async (data) => {
  const client = useSupabaseClient();
  const user = useSupabaseUser();
  console.log(user);
  const { data: updatedData, error } = await client.from('items').insert({
    amount: data.amount,
    name: data.name,
    amount_type: data.amountType,
    store: data.store,
    location: data.location,
    user: user.value.email
  });
};
