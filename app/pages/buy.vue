<script setup>
import { useItemStore } from '~/store/item';
const itemStore = useItemStore();
const { data } = await useAsyncData('items', async () => {
  return await itemStore.fetchBuyItems();
});

const colorMode = useColorMode();
colorMode.preference = 'dark';

const categories = computed(() => {
  const stores = itemStore?.purchasedItems?.map((item) => item.store);
  return [...new Set(stores)].sort((a, b) => a - b);
});
</script>
<template>
  <div v-for="category in categories" :key="category">
    <h2 class="px-2 font-bold text-white">{{ category }}</h2>
    <BuyList :items="itemStore?.purchasedItems?.filter((item) => item.store === category)"></BuyList>
  </div>
</template>
