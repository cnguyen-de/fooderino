<script setup lang="ts">
import { useItemStore } from '~/store/item';
import type { Item } from '../../../types/Item';
import { ShoppingCart } from 'lucide-vue-next';
const itemStore = useItemStore();
const addToBuy = (item) => {
  itemStore.addItemToBuy(item);
};
interface Props {
  item: Item;
}
const props = defineProps<Props>();
</script>

<template>
  <button
    class="-mr-2 flex flex-row items-center gap-0.5 rounded-full p-2 font-thin text-gray-800/70 dark:text-gray-100/50"
    :class="{ '!font-normal text-green-800 dark:text-green-300/70': item.amount_to_purchase > 0 }"
    @click="addToBuy(props?.item)">
    <ShoppingCart class="mr-1 size-4"> </ShoppingCart>
    <span class="tabular-nums">{{ item.amount_to_purchase }}</span>
  </button>
</template>
