<script setup>
const supabase = useSupabaseClient();

const { data } = await useAsyncData('items', async () => {
  return await fetchInventoryItems();
});
const categories = computed(() => data.value.map((item) => item.location));
</script>
<template>
  <div v-for="category in categories" :key="category">
    <h2 class="px-2 text-white font-bold">{{ category }}</h2>
    <InventoryList :items="data.filter((item) => item.location === category)"></InventoryList>
  </div>
</template>
