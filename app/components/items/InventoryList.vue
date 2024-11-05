<script setup lang="ts">
import type { Item } from '../../../types/Item';
import { useItemStore } from '~/store/item';

type ListItemProps = {
  items: Item[];
};
const props = defineProps<ListItemProps>();

const itemStore = useItemStore();

const onItemAmountValueChanged = (item: Item) => {
  if (item.amount <= item.default_amount) {
    item.amount_to_purchase = item.default_amount - item.amount;
  } else {
    item.amount_to_purchase = 0;
  }
  itemStore.updateItem(item);
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
      @value-changed="onItemAmountValueChanged($event)">
      <span class="tabular-nums text-gray-400/50">{{ item.amount_to_purchase }}</span>
      <AddToBuy :item="item"></AddToBuy>
    </Item>
  </div>
</template>
