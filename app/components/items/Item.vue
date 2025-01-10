<script setup lang="ts">
import { watchDebounced } from '@vueuse/core';
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
    class="border-px flex flex-row items-center rounded-full border border-gray-500/30 bg-gray-700/20 pl-4 pr-2 text-gray-200">
    <div v-if="showAmount && !useNoInventoryMode()" class="mr-5 flex items-center justify-center text-gray-400/50">
      <span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="mr-0.5 size-4">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8.242 5.992h12m-12 6.003H20.24m-12 5.999h12M4.117 7.495v-3.75H2.99m1.125 3.75H2.99m1.125 0H5.24m-1.92 2.577a1.125 1.125 0 1 1 1.591 1.59l-1.83 1.83h2.16M2.99 15.745h1.125a1.125 1.125 0 0 1 0 2.25H3.74m0-.002h.375a1.125 1.125 0 0 1 0 2.25H2.99" />
        </svg>
      </span>
      {{ amount }}
    </div>
    <Input
      v-model="itemName"
      :id="id"
      class="-ml-4 w-1/2 rounded-full border-none bg-transparent pl-4 text-lg focus-visible:bg-gray-700/50 focus-visible:outline-none focus-visible:ring-0" />

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
          class="rounded-full px-1 text-gray-300/50 peer-focus:text-gray-200/50"
          :disabled="isInputNotPressed" />
        <NumberFieldIncrement
          class="rounded-full px-1 text-gray-300/50 peer-focus:text-gray-200/50"
          :disabled="isInputNotPressed" />
      </NumberFieldContent>
    </NumberField>
    <slot />
  </div>
</template>
