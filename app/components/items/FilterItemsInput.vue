<script setup lang="ts">
import { watchDebounced } from '@vueuse/core';
import { useItemStore } from '~/store/item';
const input = ref('');
const close = ref(true);
const itemStore = useItemStore();

watchDebounced(
  input,
  () => {
    itemStore.setFilterInput(input.value);
  },
  { debounce: 300, maxWait: 500 }
);
</script>
<template>
  <Input
    :class="{ 'm-0 !w-0 !overflow-hidden !p-0': close }"
    class="duration-250 relative right-0 h-7 w-full rounded !border-0 bg-gray-300/90 pl-6 text-gray-700 transition-all focus-visible:border-none focus-visible:outline-none focus-visible:ring-0"
    placeholder="Filter"
    v-model="input">
  </Input>
  <span class="left-0" @click="close = !close">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="1.5"
      stroke="currentColor"
      class="size-6">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  </span>
</template>
