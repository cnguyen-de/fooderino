<script setup>
const { data } = await useAsyncData('items', async () => {
  return await fetchBuyItems();
});
const colorMode = useColorMode();
colorMode.preference = 'dark';

const categories = computed(() => {
  const stores = data.value.map((item) => item.store);
  return [...new Set(stores)].sort((a, b) => a - b);
});
</script>
<template>
  <div v-for="category in categories" :key="category">
    <h2 class="px-2 font-bold text-white">{{ category }}</h2>
    <BuyList :items="data.filter((item) => item.store === category)"></BuyList>
  </div>
</template>
