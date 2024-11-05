<script setup lang="ts">
import { useItemStore } from '~/store/item';
const itemStore = useItemStore();
</script>
<template>
  <div class="flex h-10 items-center justify-end gap-2 rounded-r-full px-2 py-1 backdrop-blur">
    <FilterItemsInput></FilterItemsInput>
    <CreateNewItem></CreateNewItem>
    <div class="flex flex-row items-center gap-2" v-if="itemStore.selectedItems?.length > 0">
      <EditItem v-if="itemStore.selectedItems?.length === 1"></EditItem>
    </div>
  </div>
</template>
