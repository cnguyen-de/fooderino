<script setup lang="ts">
import {
  ComboboxRoot,
  ComboboxAnchor,
  ComboboxInput,
  ComboboxPortal,
  ComboboxContent,
  ComboboxViewport,
  ComboboxItem
} from 'radix-vue';
import { Link2, Plus } from 'lucide-vue-next';
import type { PantryItem } from '~~/types/pantry';
import { formatAmount, normName } from '~~/utils/pantry';
const props = withDefaults(
  defineProps<{
    modelValue: string;
    linked: boolean;
    label: string;
    placeholder?: string;
    /** Offers only the household's items, never the typed name. */
    itemsOnly?: boolean;
    /** Offered while nothing is typed. */
    suggestions?: readonly PantryItem[];
    autoFocus?: boolean;
  }>(),
  { placeholder: 'Ingredient' }
);
const emit = defineEmits<{ 'update:modelValue': [value: string]; pick: [item: PantryItem]; typed: [name: string] }>();
const { search } = usePantry();
const open = ref(false);
const TYPED = 'typed';
const options = computed(() =>
  props.modelValue.trim() ? search(props.modelValue).slice(0, 8) : (props.suggestions ?? []).map((item) => ({ item }))
);
const typed = computed(() => {
  const name = props.modelValue.trim();
  return name && !props.itemsOnly && !options.value.some((o) => normName(o.item.name) === normName(name)) ? name : '';
});
// Radix shows only items its filter returns, and refreshes its own list only when the item count changes.
const values = computed(() => [...options.value.map((o) => o.item.id), ...(typed.value ? [TYPED] : [])]);
function select(value: unknown) {
  if (typeof value !== 'string') return;
  open.value = false;
  const picked = options.value.find((o) => o.item.id === value)?.item;
  const name = picked?.name ?? typed.value;
  if (picked) emit('pick', picked);
  else emit('typed', name);
  nextTick(() => emit('update:modelValue', name));
}
</script>
<template>
  <ComboboxRoot
    v-model:open="open"
    model-value=""
    :search-term="modelValue"
    :reset-search-term-on-blur="false"
    :filter-function="() => values"
    class="min-w-0 flex-1"
    @update:search-term="emit('update:modelValue', $event)"
    @update:model-value="select">
    <ComboboxAnchor class="relative">
      <ComboboxInput
        :aria-label="label"
        :placeholder="placeholder"
        :auto-focus="autoFocus"
        class="h-9 w-full rounded-lg border border-input bg-background pl-3 pr-8 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @focus="open = true" />
      <Link2 v-if="linked" class="absolute right-2.5 top-2.5 size-4 text-primary" aria-label="Picked from your items" />
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent
        v-if="options.length || typed"
        position="popper"
        :side-offset="4"
        class="z-[60] max-h-56 w-[var(--radix-combobox-trigger-width)] min-w-56 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
        <ComboboxViewport>
          <ComboboxItem
            v-for="option in options"
            :key="option.item.id"
            :value="option.item.id"
            class="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-muted"
            ><span class="truncate">{{ option.item.name }}</span
            ><span class="shrink-0 text-xs tabular-nums text-muted-foreground">{{
              option.item.amount > 0 ? `${formatAmount(option.item.amount, option.item.unit)} at home` : 'none at home'
            }}</span></ComboboxItem
          >
          <ComboboxItem
            v-if="typed"
            :value="TYPED"
            class="flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-primary outline-none data-[highlighted]:bg-primary/10"
            ><Plus class="size-3.5" aria-hidden="true" />Use “{{ typed }}”</ComboboxItem
          >
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
