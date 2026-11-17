<script setup lang="ts">
import {
  ComboboxRoot,
  ComboboxAnchor,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxPortal,
  ComboboxContent,
  ComboboxViewport,
  ComboboxItem
} from 'radix-vue';
import { ChevronDown, Plus } from 'lucide-vue-next';
import { normName } from '~~/utils/pantry';
const props = defineProps<{ modelValue: string; options: readonly string[]; placeholder: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; select: [value: string] }>();
const open = ref(false);
const matches = computed(() => props.options.filter((value) => normName(value).includes(normName(props.modelValue))));
const canCreate = computed(
  () => props.modelValue.trim() && !props.options.some((value) => normName(value) === normName(props.modelValue))
);
function select(value: unknown) {
  if (typeof value !== 'string') return;
  open.value = false;
  emit('select', value);
  nextTick(() => emit('update:modelValue', ''));
}
</script>
<template>
  <ComboboxRoot
    v-model:open="open"
    model-value=""
    :search-term="modelValue"
    :reset-search-term-on-blur="false"
    :filter-function="(values) => values"
    class="min-w-0 flex-1"
    @update:search-term="emit('update:modelValue', $event)"
    @update:model-value="select">
    <ComboboxAnchor class="relative">
      <ComboboxInput
        aria-label="New tag"
        :placeholder="placeholder"
        class="h-9 w-full rounded-lg border border-input bg-background pl-3 pr-8 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @focus="open = true" />
      <ComboboxTrigger
        type="button"
        aria-label="Show existing tags"
        class="absolute right-0 top-0 flex size-9 items-center justify-center text-muted-foreground"
        ><ChevronDown class="size-3.5" aria-hidden="true"
      /></ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent
        position="popper"
        :side-offset="4"
        class="z-[60] max-h-48 w-[var(--radix-combobox-trigger-width)] min-w-40 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
        <ComboboxViewport>
          <ComboboxItem
            v-for="value in matches"
            :key="value"
            :value="value"
            class="cursor-pointer rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-muted"
            >{{ value }}</ComboboxItem
          >
          <ComboboxItem
            v-if="canCreate"
            :value="modelValue.trim()"
            class="flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-primary outline-none data-[highlighted]:bg-primary/10"
            ><Plus class="size-3.5" aria-hidden="true" />Create “{{ modelValue.trim() }}”</ComboboxItem
          >
          <p v-if="!matches.length && !canCreate" class="px-2.5 py-2 text-xs text-muted-foreground">
            Type a new place or store
          </p>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
