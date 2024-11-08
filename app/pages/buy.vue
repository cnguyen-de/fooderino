<script setup>
import { useItemStore } from '~/store/item';
const itemStore = useItemStore();
const { data } = await useAsyncData('items', async () => {
  return await itemStore.fetchBuyItems();
});

const categories = computed(() => {
  const stores = itemStore?.purchasedItems?.map((item) => item.store);
  return [...new Set(stores)].sort((a, b) => a.localeCompare(b));
});
</script>
<template>
  <NuxtLayout name="app">
    <NuxtLayout name="list">
      <div class="h-[calc(100%_-_7rem)] w-full overflow-auto">
        <div v-for="category in categories" :key="category">
          <h2 class="px-2 font-bold text-white">{{ category }}</h2>
          <BuyList
            :items="
              itemStore?.purchasedItems
                ?.filter((item) => item.store === category)
                .sort((a, b) => a.id - b.id || a.name.localeCompare(b?.name))
            "></BuyList>
        </div>
      </div>
    </NuxtLayout>
  </NuxtLayout>
</template>
