<script setup lang="ts">
import { watchDebounced } from '@vueuse/core';
import { House } from 'lucide-vue-next';
import type { Item } from '~~/types/Item';

export type ItemProps = {
  id: number;
  name: string;
  amount: number;
  amount_to_purchase: number;
  amount_type: string;
  showAmount: boolean;
  toRight: boolean;
  disableSwipe?: boolean;
  amountAsNumberInput?: boolean;
  default_amount?: number;
  item: Item;
};
const props = withDefaults(defineProps<ItemProps>(), {
  id: 0,
  name: '',
  amount: 0,
  amount_to_purchase: 0,
  showAmount: false,
  toRight: false,
  disableSwipe: false,
  amountAsNumberInput: true,
  default_amount: 0
});

const emit = defineEmits(['valueChanged']);

const amountValue = ref(props.amountAsNumberInput ? props.amount : props.amount_to_purchase);
watch(
  () => props.amount,
  (value) => {
    amountValue.value = value;
  }
);
const onValueUpdated = (value: number) => {
  if (amountValue.value === value) return;
  amountValue.value = value;
  if (props.amountAsNumberInput) {
    emit('valueChanged', { ...props, amount: value });
  } else {
    emit('valueChanged', { ...props, amount_to_purchase: value });
  }
};

const itemName = ref(props.name);
watchDebounced(
  itemName,
  () => {
    emit('valueChanged', { ...props, name: itemName.value });
  },
  { debounce: 500, maxWait: 1000 }
);

const isInputNotPressed = ref(true);
const onInputClick = (state) => {
  isInputNotPressed.value = state;
};
</script>

<template>
  <div
    class="border-px flex flex-row items-center rounded-xl border border-border bg-gray-100/70 pl-4 pr-2 dark:bg-gray-700/20">
    <div v-if="showAmount && !useNoInventoryMode()" class="mr-5 flex items-center justify-center">
      <House class="mr-1 size-4 opacity-50"></House>
      <p class="tabular-nums opacity-50">
        {{ amount }}
      </p>
    </div>
    <Input
      v-model="itemName"
      :id="id"
      class="-ml-4 w-1/2 rounded-xl border-none bg-transparent pl-4 text-lg focus-visible:bg-gray-100/50 focus-visible:outline-none focus-visible:ring-0 dark:focus-visible:bg-gray-700/50" />

    <div class="flex-grow"></div>
    <EditItem :item="item" :is-buy-list="showAmount"></EditItem>

    <NumberField
      :step="amount_type === 'count' ? 1 : 100"
      class="w-20"
      :id="name.toString()"
      :default-value="amountValue"
      :model-value="amountValue"
      @update:model-value="onValueUpdated($event)"
      :min="0">
      <NumberFieldContent>
        <NumberFieldInput
          class="peer border-none text-base"
          @focusin="onInputClick(false)"
          @focusout="onInputClick(true)" />
        <NumberFieldDecrement
          class="rounded-full px-1 text-gray-800/50 peer-focus:text-gray-900/50 dark:text-gray-300/50 dark:peer-focus:text-gray-200/50"
          :disabled="isInputNotPressed" />
        <NumberFieldIncrement
          class="rounded-full px-1 text-gray-800/50 peer-focus:text-gray-900/50 dark:text-gray-300/50 dark:peer-focus:text-gray-200/50"
          :disabled="isInputNotPressed" />
      </NumberFieldContent>
    </NumberField>
    <slot />
  </div>
</template>
