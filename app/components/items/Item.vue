<script setup lang="ts">
import { addItemToInventory } from '~/composables/addToInventory'
export type ItemProps = {
  id: number
  name: string
  amount: number
  amount_to_purchase: number
  showAmount?: boolean
}
const props = withDefaults(defineProps<ItemProps>(),
  {
    showAmount: false
  }
);
</script>

<template>
  <div class="rounded-md flex flex-row p-2 text-gray-200 bg-gray-700/20">
    <div>{{  name }}</div>
    <div v-if="showAmount" class="flex items-center justify-center size-6 p-1 text-green-400 border border-green-800 rounded-full ml-2">{{  amount }}</div>
    <div class="flex-grow"></div>
    <slot />
  </div>
</template>