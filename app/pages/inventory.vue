<script setup>
import { useItemStore } from '~/store/item';
const itemStore = useItemStore();
const { data } = await useAsyncData('items', async () => {
  return await itemStore.fetchInventoryItems();
});
const categories = computed(() => {
  const cat = itemStore.getFilteredInventoryItems?.map((item) => item.location);
  return [...new Set(cat)].sort((a, b) => a.localeCompare(b));
});
const items = computed(() => {
  return [...new Set(itemStore.getFilteredInventoryItems)].sort((a, b) => a - b);
});
</script>
<template>
  <div class="h-[calc(100%_-_4rem)] w-full overflow-auto">
    <ListSelector></ListSelector>
    <div v-for="category in categories" :key="category">
      <h2 class="px-2 font-bold text-white">{{ category }}</h2>
      <InventoryList
        :items="
          items
            ?.filter((item) => item.location === category)
            .sort((a, b) => a.id - b.id || a.name.localeCompare(b.name))
        "></InventoryList>
    </div>
  </div>
</template>
