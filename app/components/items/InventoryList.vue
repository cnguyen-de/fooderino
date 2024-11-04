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
const onItemClicked = (item: ItemProps) => {
  itemStore.selectItem(item.id);
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
      @item-swiped="onItemSwiped($event)"
      @item-clicked="onItemClicked($event)"
      :class="{ '!bg-gray-600/60': itemStore.isItemSelected(item.id) }">
      <NumberField
        :step="item.amount_type === 'count' ? '1' : '100'"
        class="-mr-2 w-24"
        id="age"
        :default-value="item.amount"
        :min="0">
        <NumberFieldContent>
          <NumberFieldDecrement class="rounded-full hover:bg-gray-700/30" @click="removeItemByOne(item)" />
          <NumberFieldInput class="border-none" />
          <NumberFieldIncrement class="rounded-full hover:bg-gray-700/30" @click="addItemByOne(item)" />
        </NumberFieldContent>
      </NumberField>
    </Item>
  </div>
</template>
