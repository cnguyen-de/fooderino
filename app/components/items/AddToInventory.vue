<script setup lang="ts">
import { useItemStore } from '~/store/item';
import type { ItemRecord } from '~~/types/sync';
const itemStore = useItemStore();
export type ItemProps = {
  item: ItemRecord;
};
defineProps<ItemProps>();
</script>

<template>
  <button @click="itemStore.addItemToInventory(item)">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="1.5"
      stroke="currentColor"
      class="size-5">
      <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  </button>
</template>
