<script setup lang="ts">
import { addItemToInventory } from '~/composables/addToInventory'
export type ItemProps = {
  id: number
  name: string
  amount: number
  amount_to_purchase: number
}
const props = defineProps<ItemProps>();
</script>

<template>
  <div class="flex flex-row">
    <div>{{  name }}</div>
    <div class="flex-grow"></div>
    <slot />
  </div>
</template>