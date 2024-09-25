<script setup lang="ts">
import type { ItemProps } from './Item.vue';

type ListItemProps = {
  items: ItemProps[]
}
const props = defineProps<ListItemProps>();
</script>

<template>
  <div v-for=" item in items" :key="item.id">
    <Item :id="item.id" :name="item.name" :amount="item.amount" :amount_to_purchase="item.amount_to_purchase" >
      <div> {{  item.amount_to_purchase }}</div>
      <AddToInventory :item="item" />
    </Item>
  </div>
</template>