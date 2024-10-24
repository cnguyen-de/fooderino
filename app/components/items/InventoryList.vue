<script setup lang="ts">
import type { ItemProps } from './Item.vue';
import { useItemStore } from '~/store/item';

type ListItemProps = {
  items: ItemProps[];
};
const props = defineProps<ListItemProps>();

const itemStore = useItemStore();
const onItemSwiped = (item: ItemProps) => {
  console.log('swiped', item.id);
};
const removeItemByOne = async (item: ItemProps) => {
  const newItem = { ...item, amount: item.amount > 0 ? item.amount - 1 : 0 };
  if (newItem.amount < newItem.default_amount) {
    newItem.amount_to_purchase = newItem.default_amount - newItem.amount;
  }
  await itemStore.updateItem(newItem);
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
      :disable-swipe="true"
      @item-swiped="onItemSwiped($event)">
      <button class="z-50 mr-2 size-8 rounded bg-gray-500/20 hover:bg-gray-500/40" @click="removeItemByOne(item)">
        -
      </button>
      <div class="w-4 text-right">{{ item.amount }}</div>
    </Item>
  </div>
</template>
