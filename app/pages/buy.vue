<script setup>
const supabase = useSupabaseClient()
const client = useSupabaseClient()

const { data } = await useAsyncData('items', async () => {
  const { data } = await client.from('items').select().gte('amount_to_purchase', 1  );
  console.log(data);
  return data
})
</script>
<template>
  Buy

  <BuyList :items="data"></BuyList>
  </template>