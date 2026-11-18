<script setup lang="ts">
import type { RecipeKind } from '~~/types/cook';
defineProps<{ kind: RecipeKind }>();
</script>
<template>
  <span
    class="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
    :class="
      kind === 'soup' ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
    "
    >{{ kind === 'soup' ? 'Soup' : 'Dish' }}</span
  >
</template>
