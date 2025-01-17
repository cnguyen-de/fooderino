<script setup lang="ts">
import { watchDebounced } from '@vueuse/core';
import { useItemStore } from '~/store/item';
const close = ref(true);
const itemStore = useItemStore();
const input = ref(itemStore.filterInput);

watchDebounced(
  input,
  () => {
    itemStore.setFilterInput(input.value);
  },
  { debounce: 300, maxWait: 500 }
);
</script>
<template>
  <div class="relative">
    <Input
      class="right-0 h-8 w-full rounded !border-0 bg-gray-100/30 pl-7 text-gray-700 transition-all focus-visible:border-none focus-visible:outline-none focus-visible:ring-0 dark:bg-gray-700/30 dark:text-gray-300"
      placeholder="Find items"
      v-model="input">
    </Input>
    <span class="absolute left-1.5 top-2 text-gray-500/60">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="size-4">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
      </svg>
    </span>
    <button class="absolute right-2 top-2" :class="[input.length === 0 ? 'hidden' : 'block']" @click="input = ''">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="size-4">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>
