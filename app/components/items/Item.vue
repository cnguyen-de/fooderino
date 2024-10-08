<script setup lang="ts">
import type { UseSwipeDirection } from '@vueuse/core';
import { useSwipe } from '@vueuse/core';
import { computed, ref } from 'vue';

import { addItemToInventory } from '~/composables/addToInventory';

export type ItemProps = {
  id: number;
  name: string;
  amount: number;
  amount_to_purchase: number;
  showAmount: boolean;
  toRight: boolean;
  disableSwipe?: boolean;
};
const props = withDefaults(defineProps<ItemProps>(), {
  id: 0,
  name: '',
  amount: 0,
  amount_to_purchase: 0,
  showAmount: false,
  toRight: false,
  disableSwipe: false
});

const emit = defineEmits(['itemSwiped']);

const target = ref<HTMLElement | null>(null);
const container = ref<HTMLElement | null>(null);
const containerWidth = computed(() => container.value?.offsetWidth);
const left = ref('0');
const opacity = ref(1);

const { direction, isSwiping, lengthX, lengthY } = useSwipe(target, {
  passive: false,
  onSwipe(e: TouchEvent) {
    if (props.toRight) {
      if (containerWidth.value) {
        if (lengthX.value < 0) {
          const length = Math.abs(lengthX.value);
          left.value = `${length}px`;
          opacity.value = 1.1 - length / containerWidth.value;
        } else {
          left.value = '0';
          opacity.value = 1;
        }
      }
    } else {
      if (containerWidth.value) {
        if (lengthX.value > 0) {
          const length = Math.abs(lengthX.value);
          left.value = `-${length}px`;
          opacity.value = 1.1 - length / containerWidth.value;
        } else {
          left.value = '0';
          opacity.value = 1;
        }
      }
    }
  },
  onSwipeEnd(e: TouchEvent, direction: UseSwipeDirection) {
    if (props.toRight) {
      if (lengthX.value < 0 && containerWidth.value && Math.abs(lengthX.value) / containerWidth.value >= 0.5) {
        emit('itemSwiped', props);
        left.value = '100%';
        opacity.value = 0;
      } else {
        left.value = '0';
        opacity.value = 1;
      }
    } else {
      if (lengthX.value > 0 && containerWidth.value && Math.abs(lengthX.value) / containerWidth.value >= 0.5) {
        emit('itemSwiped', props);
        left.value = '-100%';
        opacity.value = 0;
      } else {
        left.value = '0';
        opacity.value = 1;
      }
    }
  }
});
</script>

<template>
  <div
    v-if="opacity > 0"
    class="item-container relative flex h-10 select-none flex-row items-center justify-center overflow-hidden"
    ref="container">
    <div
      ref="target"
      class="overlay rounded-md bg-gray-700/20 p-2 text-gray-200"
      :class="{ animated: !isSwiping }"
      :style="{ left, opacity }">
      <div class="flex flex-row">
        <div>{{ name }}</div>
        <div
          v-if="showAmount"
          class="ml-2 flex size-6 items-center justify-center rounded-full border border-green-800 p-1 text-green-400">
          {{ amount }}
        </div>
        <div class="flex-grow"></div>
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  position: absolute;
}

.overlay.animated {
  transition: all 0.2s ease-in-out;
}
</style>
