<script setup lang="ts">
  import { addItemToInventory } from '~/composables/addToInventory'
  export type ItemProps = {
   item: Item;
  }
  defineProps<ItemProps>();
</script>

<template>
    <button @click="addItemToInventory(item)">Buy</button>
</template>