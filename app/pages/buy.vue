<script setup>
const { data } = await useAsyncData('items', async () => {
  return await fetchBuyItems();
})
const colorMode = useColorMode();
colorMode.preference = 'dark';
</script>
<template>
  <BuyList :items="data"></BuyList>
</template>