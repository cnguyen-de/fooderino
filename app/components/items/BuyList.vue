<script setup lang="ts">
import { useItemStore } from '~/store/item';
import type { Item } from '~~/types/Item';
const itemStore = useItemStore();

type ListItemProps = {
  items: Item[];
};
defineProps<ListItemProps>();
const onValueChanged = (item: Item) => {
  itemStore.updateItem(item);
};
const onAddItemToInventory = async (item: ItemProps) => {
  await itemStore.addItemToInventory(item);
};
</script>

<template>
  <div class="flex flex-col gap-1 p-4">
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
        :to-right="false"
        :item="item"
        show-amount
        disable-swipe
        :amount-as-number-input="false"
        @value-changed="onValueChanged($event)">
        <button
          class="flex size-7 items-center justify-center rounded-full hover:bg-green-400/10 hover:text-green-500"
          @click="onAddItemToInventory(item)">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="size-6">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </button>
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
  transform: translateX(-100%);
}
</style>
