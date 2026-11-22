<script setup lang="ts">
import { House, Minus, Plus, Square } from 'lucide-vue-next';
import type { PantryItem } from '~~/types/pantry';
import { formatAmount, oneUse } from '~~/utils/pantry';
const props = defineProps<{
  item: PantryItem;
  matched?: string;
  shop?: boolean;
  adding?: boolean;
  qty?: number;
}>();
const atHome = computed(() => formatAmount(props.item.amount, props.item.unit));
const oneTap = computed(() => formatAmount(oneUse(props.item.amount, props.item.unit), props.item.unit));
defineEmits<{ edit: []; action: []; add: [] }>();
</script>
<template>
  <div
    class="group flex h-9 items-center gap-2 rounded-lg bg-muted/40 pr-0.5 text-sm transition-colors focus-within:bg-muted/80 hover:bg-muted/80"
    :class="$slots.leading ? 'pl-0.5' : 'pl-2.5'">
    <slot name="leading" />
    <button type="button" class="flex h-8 min-w-0 flex-1 items-center gap-2 text-left" @click="$emit('edit')">
      <span class="min-w-0 flex-1 truncate font-medium" :title="item.name">
        {{ item.name }}<span v-if="matched" class="font-normal text-muted-foreground"> · matched {{ matched }}</span>
      </span>
      <span
        v-if="shop || adding"
        class="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground"
        :title="`${atHome} at home`"
        ><House class="size-3" aria-hidden="true" /><span class="sr-only">At home: </span>{{ atHome }}</span
      >
    </button>
    <template v-if="shop && !adding">
      <span class="min-w-8 shrink-0 pr-2 text-right text-sm tabular-nums">{{
        formatAmount(qty ?? item.to_buy, item.unit)
      }}</span>
      <button
        type="button"
        class="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        :aria-label="`Buy ${item.name}`"
        @click="$emit('action')">
        <Square class="size-4" :stroke-width="1.5" aria-hidden="true" />
      </button>
    </template>
    <Button
      v-else-if="adding"
      variant="ghost"
      class="h-8 min-w-10 shrink-0 gap-0.5 px-2 py-0 text-xs text-primary hover:bg-primary/10 hover:text-primary"
      :aria-label="`List ${item.name}`"
      @click="$emit('action')"
      ><Plus class="size-3" aria-hidden="true" />List</Button
    >
    <template v-else>
      <Button
        v-if="item.amount <= 0"
        variant="ghost"
        size="xs"
        class="shrink-0 text-xs text-primary hover:bg-primary/10 hover:text-primary"
        :aria-label="`List ${item.name}`"
        @click="$emit('action')"
        >List</Button
      >
      <div class="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="icon"
          class="size-8 text-muted-foreground hover:bg-primary/10 hover:text-primary"
          :disabled="item.amount <= 0"
          :aria-label="`Use ${oneTap} ${item.name}`"
          @click="$emit('action')"
          ><Minus class="size-4" aria-hidden="true"
        /></Button>
        <span
          class="min-w-6 text-center text-sm font-semibold tabular-nums"
          :class="item.amount > 0 ? 'text-foreground' : 'text-muted-foreground'"
          >{{ atHome }}</span
        >
        <Button
          variant="ghost"
          size="icon"
          class="size-8 text-muted-foreground hover:bg-primary/10 hover:text-primary"
          :aria-label="`Add one ${item.name}`"
          @click="$emit('add')"
          ><Plus class="size-4" aria-hidden="true"
        /></Button>
      </div>
    </template>
  </div>
</template>
