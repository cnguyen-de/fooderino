<script setup lang="ts">
import type { RecipeView } from '~/composables/useCook';
const props = defineProps<{ recipe: RecipeView }>();
const tracked = computed(() => props.recipe.ingredientsAtHome.some((s) => s.stock !== 'untracked'));
</script>
<template>
  <span v-if="recipe.out" class="shrink-0 text-[10px] font-medium text-destructive">{{ recipe.out }} missing</span>
  <span v-else-if="recipe.short" class="shrink-0 text-[10px] font-medium text-orange-700 dark:text-orange-300"
    >{{ recipe.short }} short</span
  >
  <span v-else-if="tracked" class="shrink-0 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
    >All at home</span
  >
</template>
