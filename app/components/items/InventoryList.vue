<script setup lang="ts">
import type { ItemProps } from './Item.vue';

type ListItemProps = {
  items: ItemProps[];
};
const props = defineProps<ListItemProps>();
const onItemSwiped = (item: ItemProps) => {
  console.log('swiped', item.id);
};
const removeItemByOne = async (item: ItemProps) => {
  const newItem = { ...item, amount: item.amount - 1 };
  if (newItem.amount < newItem.default_amount) {
    newItem.amount_to_purchase = newItem.default_amount - newItem.amount;
  }
  await updateItem(newItem);
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
      <button class="absolute right-4 z-50 mr-2 rounded bg-gray-500/50 px-2" @click="removeItemByOne(item)">-</button>
      <div class="w-4 text-right">{{ item.amount }}</div>
    </Item>
  </div>
</template>
