<script setup>
const supabase = useSupabaseClient()

const { data } = await useAsyncData('items', async () => {
  return await fetchInventoryItems();
})
</script>
<template>
  inventory
  <InventoryList :items="data"></InventoryList>

  <button
    class="mt-3"
    @click="supabase.auth.signOut()">
    Log out
  </button>
  </template>