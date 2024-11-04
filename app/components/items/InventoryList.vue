<script setup lang="ts">
import type { Item } from '../../../types/Item';
import { useItemStore } from '~/store/item';

type ListItemProps = {
  items: Item[];
};
const props = defineProps<ListItemProps>();

const itemStore = useItemStore();
const onItemSwiped = (item: ItemProps) => {
  console.log('swiped', item.id);
};
const removeItemByOne = async (item: ItemProps) => {
  let newItem = {};
  if (item.amount <= 0) {
    newItem = { ...item, amount: 0 };
  } else {
    if (item.amount_type === 'count') {
      newItem = { ...item, amount: item.amount - 1 };
    } else if (item.amount_type === 'gram') {
      newItem = { ...item, amount: item.amount - 100 };
    }
  }

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
const onItemAmountValueChanged = (item: Item) => {
  itemStore.updateItem(item);
  console.log(item, item.amount);
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
      :amount_type="item.amount_type"
      :amount_to_purchase="item.amount_to_purchase"
      :to-right="true"
      :show-amount="false"
      :disable-swipe="true"
      @item-swiped="onItemSwiped($event)"
      @value-changed="onItemAmountValueChanged($event)"
      :class="{ '!bg-gray-600/60': itemStore.isItemSelected(item.id) }">

      <span class="text-gray-400/50 tabular-nums">{{ item.amount_to_purchase }}</span>
      <AddToBuy :item="item"></AddToBuy>
    </Item>
  </div>
</template>
