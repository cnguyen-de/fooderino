<script setup>
const supabase = useSupabaseClient();

const { data } = await useAsyncData('items', async () => {
  return await fetchInventoryItems();
});
</script>
<template>
  <InventoryList :items="data"></InventoryList>
</template>
