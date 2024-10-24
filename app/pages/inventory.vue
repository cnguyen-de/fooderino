<script setup>
import { useItemStore } from '~/store/item';
const itemStore = useItemStore();
const { data } = await useAsyncData('items', async () => {
  return await itemStore.fetchInventoryItems();
});
const categories = computed(() => {
  const cat = itemStore.inventoryItems.map((item) => item.location);
  return [...new Set(cat)].sort((a, b) => a - b);
});
const items = computed(() => {
  return [...new Set(itemStore.inventoryItems)].sort((a, b) => a - b);
});
</script>
<template>
  <div v-for="category in categories" :key="category">
    <h2 class="px-2 font-bold text-white">{{ category }}</h2>
    <InventoryList :items="items?.filter((item) => item.location === category)"></InventoryList>
  </div>
</template>
