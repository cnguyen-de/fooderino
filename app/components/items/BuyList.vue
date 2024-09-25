<script setup lang="ts">
import type { ItemProps } from './Item.vue';

type ListItemProps = {
  items: ItemProps[]
}
const props = defineProps<ListItemProps>();
</script>

<template>
  <div class="flex flex-col gap-1 p-4">
    <Item v-for="item in items" :key="item.id" :id="item.id" :name="item.name" :amount="item.amount" :amount_to_purchase="item.amount_to_purchase" show-amount >
    <div class="px-2"> {{  item.amount_to_purchase }}</div>
    <AddToInventory :item="item" />    </Item>
  </div>
</template>