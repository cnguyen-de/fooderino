<script setup>
const supabase = useSupabaseClient();

const { data } = await useAsyncData('items', async () => {
  return await fetchInventoryItems();
});
const categories = computed(() => {
  const cat = data.value.map((item) => item.location);
  return [...new Set(cat)].sort((a, b) => a - b);
});
</script>
<template>
  <div v-for="category in categories" :key="category">
    <h2 class="px-2 font-bold text-white">{{ category }}</h2>
    <InventoryList :items="data.filter((item) => item.location === category)"></InventoryList>
  </div>
</template>
