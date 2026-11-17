<script setup lang="ts">
import type { PantryItem } from '~~/types/pantry';
defineProps<{ item: PantryItem; matched?: string; shop?: boolean; adding?: boolean; qty?: number }>();
defineEmits<{ edit: []; action: [] }>();
</script>
<template>
  <div class="flex min-h-16 items-center gap-3 rounded-xl border bg-card p-2 pl-3">
    <button
      v-if="shop && !adding"
      type="button"
      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-xl"
      :aria-label="`Buy ${item.name}`"
      @click="$emit('action')">
      □
    </button>
    <button type="button" class="min-w-0 flex-1 py-2 text-left" @click="$emit('edit')">
      <span class="block truncate font-semibold">{{ item.name }}</span
      ><span class="block text-xs text-muted-foreground"
        >{{ item.amount }}{{ item.unit === 'gram' ? ' g' : '' }} at home<span v-if="matched">
          · matched {{ matched }}</span
        ></span
      >
    </button>
    <span v-if="shop && !adding" class="text-sm tabular-nums"
      >{{ qty ?? item.to_buy }}{{ item.unit === 'gram' ? ' g' : '' }}</span
    >
    <Button
      v-else
      variant="secondary"
      class="h-11 min-w-14"
      :aria-label="adding ? `List ${item.name}` : item.amount > 0 ? `Use one ${item.name}` : `List ${item.name}`"
      @click="$emit('action')"
      >{{ adding ? '+ List' : item.amount > 0 ? '−1' : 'To list' }}</Button
    >
  </div>
</template>
