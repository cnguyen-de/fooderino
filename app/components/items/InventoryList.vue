<script setup lang="ts">
import type { ItemRecord } from '~~/types/sync';
import { useItemStore } from '~/store/item';

type ListItemProps = {
  items: ItemRecord[];
};
defineProps<ListItemProps>();

const itemStore = useItemStore();

// The payload is the emitted spread of Item.vue's props, not the stored row,
// so topping up `amount_to_purchase` here mutates a copy and is safe.
const onItemAmountValueChanged = (item: ItemRecord) => {
  if (item.amount < item.default_amount) {
    item.amount_to_purchase = item.default_amount - item.amount;
  }
  itemStore.updateItem(item);
};
</script>

<template>
  <div class="flex flex-col justify-center gap-1 px-4">
    <TransitionGroup>
      <Item
        v-for="item in items"
        :key="item.id"
        :id="item.id"
        :name="item.name"
        :amount="item.amount"
        :amount_type="item.amount_type"
        :amount_to_purchase="item.amount_to_purchase"
        :default_amount="item.default_amount"
        :to-right="true"
        :show-amount="false"
        :disable-swipe="true"
        :item="item"
        @value-changed="onItemAmountValueChanged($event)">
        <AddToBuy :item="item"></AddToBuy>
      </Item>
    </TransitionGroup>
  </div>
</template>
<style scoped>
.v-enter-active {
  transition: all 0.25s ease-in;
}
.v-leave-active {
  transition: all 0.25s ease-out;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}
</style>
