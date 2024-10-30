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

const addItemByOne = async (item: ItemProps) => {
  let newItem = {};
  if (item.amount_type === 'count') {
    newItem = { ...item, amount: item.amount + 1 };
  } else if (item.amount_type === 'gram') {
    newItem = { ...item, amount: item.amount + 100 };
  }
  if (newItem.amount < newItem.default_amount) {
    newItem.amount_to_purchase = newItem.default_amount - newItem.amount;
  } else {
    newItem.amount_to_purchase = 0;
  }
  await itemStore.updateItem(newItem);
};

const renderType = (amountType: string) => {
  if (amountType === 'kg') {
    return 'kg';
  } else if (amountType === 'gram') {
    return 'g';
  }
  return '';
};
</script>

<template>
  <div class="flex flex-col justify-center gap-1 p-4">
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
      <div class="mr-2 self-center whitespace-nowrap text-right">
        {{ item.amount }}{{ renderType(item.amount_type) }}
      </div>
      <button class="mr-1 size-8 rounded bg-gray-500/20 hover:bg-gray-500/40" @click="removeItemByOne(item)">-</button>
      <button class="-mr-2 size-8 rounded bg-gray-500/20 hover:bg-gray-500/40" @click="addItemByOne(item)">+</button>
    </Item>
  </div>
</template>
