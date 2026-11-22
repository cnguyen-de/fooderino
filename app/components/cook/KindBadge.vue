<script setup lang="ts">
import type { RecipeKind } from '~~/types/cook';
import { KIND_TEXT } from '~/utils/cook-format';
defineProps<{ kind: RecipeKind }>();
const TONE: Record<RecipeKind, string> = {
  dish: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  soup: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  whole_meal: 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
};
</script>
<template>
  <span
    class="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
    :class="TONE[kind]"
    >{{ KIND_TEXT[kind].one }}</span
  >
</template>
