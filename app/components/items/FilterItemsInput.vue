<script setup lang="ts">
import { watchDebounced } from '@vueuse/core';
import { useItemStore } from '~/store/item';
const input = ref('');
const itemStore = useItemStore();

watchDebounced(
  input,
  () => {
    itemStore.setFilterInput(input.value);
  },
  { debounce: 500, maxWait: 1000 }
);
</script>
<template>
  <Input
    class="h-7 rounded-md bg-gray-300/90 text-gray-700 outline-none ring-0"
    placeholder="type to filter"
    v-model="input"></Input>
</template>
