<script setup>
import { useItemStore } from '~/store/item';
import { useSettingsStore } from '~/store/settings';
const itemStore = useItemStore();
const settingStore = useSettingsStore();
onMounted(() => {
  itemStore.fetchInventoryItems();
});
const categories = computed(() => {
  const cat = itemStore.getFilteredInventoryItems?.map((item) => item.location);
  return [...new Set(cat)].sort((a, b) => a.localeCompare(b));
});
const items = computed(() => {
  let items = itemStore.getFilteredInventoryItems;
  if (!settingStore.settings?.show_empty_items) {
    items = items.filter((item) => item.amount > 0);
  }
  return [...new Set(items)].sort((a, b) => a - b);
});
</script>
<template>
  <NuxtLayout name="app">
    <NuxtLayout name="list">
      <div class="h-[calc(100%_-_7rem)] w-full overflow-auto">
        <div v-for="category in categories" :key="category">
          <h2 class="px-4 font-bold text-white">{{ category }}</h2>
          <InventoryList
            :items="
              items
                ?.filter((item) => item.location === category)
                .sort((a, b) => a.id - b.id || a.name.localeCompare(b?.name))
            "></InventoryList>
        </div>
      </div>
    </NuxtLayout>
  </NuxtLayout>
</template>
