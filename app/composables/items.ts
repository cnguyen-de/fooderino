export const insertItem = async (data) => {
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

export const updateItem = async (data) => {
  const client = useSupabaseClient();
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
};
