<script setup>
const { data } = await useAsyncData('items', async () => {
  return await fetchBuyItems();
})
</script>
<template>
  <BuyList :items="data"></BuyList>
</template>