<script setup lang="ts">
import type { ItemProps } from './Item.vue';

type ListItemProps = {
  items: ItemProps[];
};
const props = defineProps<ListItemProps>();
const onItemSwiped = (item: ItemProps) => {
  console.log('swiped', item.id);
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
      :to-right="true"
      :show-amount="false"
      @item-swiped="onItemSwiped($event)">
      <div>{{ item.amount }}</div>
    </Item>
  </div>
</template>
