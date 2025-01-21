<script setup lang="ts">
import { watchDebounced } from '@vueuse/core';
import { SearchIcon, X } from 'lucide-vue-next';
import { useItemStore } from '~/store/item';
const close = ref(true);
const itemStore = useItemStore();
const input = ref(itemStore.filterInput);

watchDebounced(
  input,
  () => {
    itemStore.setFilterInput(input.value);
  },
  { debounce: 500, maxWait: 800 }
);

const inputField = useTemplateRef('input-field');

const focusInputField = () => {
  inputField.value.focus();
};
</script>
<template>
  <div class="relative">
    <input
      class="peer right-0 h-9 rounded-full !border-0  px-4 pr-7 text-gray-700 transition-all duration-150 ease-in-out focus:w-full focus-visible:border-none focus-visible:outline-none focus-visible:ring-0  dark:text-gray-300 focus:bg-gray-100/30 focus:dark:bg-gray-700/30"
      :class="[input.length !== 0 ? 'w-full bg-gray-100/30 dark:bg-gray-700/30' : 'w-10 bg-transparent']"
      placeholder="Find items"
      ref="input-field"
      v-model="input">
    </input>
    <button
      class="absolute right-3 top-2 text-gray-700 dark:text-gray-300"
      :class="[input.length !== 0 ? 'hidden' : 'block']"
      @click="focusInputField">
      <SearchIcon class="size-5"></SearchIcon>
    </button>
    <button class="absolute right-3 top-2.5 text-gray-700 dark:text-gray-300" :class="[input.length === 0 ? 'hidden' : 'block']" @click="input = ''">
      <X class="size-4"></X>
    </button>
  </div>
</template>
