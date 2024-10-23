<script setup lang="ts">
import type { ItemProps } from './Item.vue';
import { addItemToInventory } from '~/composables/addToInventory';

type ListItemProps = {
  items: ItemProps[];
};
const props = defineProps<ListItemProps>();
const onItemSwiped = (item: ItemProps) => {
  console.log('swiped', item.id, item);
  addItemToInventory(item);
};
</script>

<template>
  <div class="flex flex-col gap-1 p-4">
    <Item
      v-for="item in items"
      :key="item.id"
      :id="item.id"
      :name="item.name"
      :amount="item.amount"
      :amount_to_purchase="item.amount_to_purchase"
      :to-right="false"
      show-amount
      @item-swiped="onItemSwiped($event)">
      <div class="px-2">{{ item.amount_to_purchase }}</div>
    </Item>
  </div>
</template>
