<script setup lang="ts">
import { Minus, Plus, Square } from 'lucide-vue-next';
import type { PantryItem } from '~~/types/pantry';
defineProps<{ item: PantryItem; matched?: string; shop?: boolean; adding?: boolean; qty?: number }>();
defineEmits<{ edit: []; action: [] }>();
</script>
<template>
  <div
    class="group flex h-9 items-center gap-2 rounded-lg bg-muted/40 pl-2.5 pr-0.5 text-sm transition-colors focus-within:bg-muted/80 hover:bg-muted/80">
    <button
      v-if="shop && !adding"
      type="button"
      class="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
      :aria-label="`Buy ${item.name}`"
      @click="$emit('action')">
      <Square class="size-4" :stroke-width="1.5" aria-hidden="true" />
    </button>
    <button type="button" class="flex h-8 min-w-0 flex-1 items-center gap-2 text-left" @click="$emit('edit')">
      <span class="min-w-0 flex-1 truncate font-medium" :title="item.name">
        {{ item.name }}<span v-if="matched" class="font-normal text-muted-foreground"> · matched {{ matched }}</span>
      </span>
      <span class="shrink-0 text-[11px] tabular-nums text-muted-foreground"
        >{{ item.amount }}{{ item.unit === 'gram' ? ' g' : '' }} at home</span
      >
    </button>
    <span v-if="shop && !adding" class="min-w-8 shrink-0 pr-2 text-right text-sm tabular-nums"
      >{{ qty ?? item.to_buy }}{{ item.unit === 'gram' ? ' g' : '' }}</span
    >
    <Button
      v-else
      variant="ghost"
      class="h-8 min-w-10 shrink-0 gap-0.5 px-2 py-0 text-xs text-primary hover:bg-primary/10 hover:text-primary"
      :aria-label="adding ? `List ${item.name}` : item.amount > 0 ? `Use one ${item.name}` : `List ${item.name}`"
      @click="$emit('action')"
      ><template v-if="!adding && item.amount > 0"><Minus class="size-3" aria-hidden="true" />1</template>
      <template v-else><Plus class="size-3" aria-hidden="true" />List</template></Button
    >
    <slot name="trailing" />
  </div>
</template>
