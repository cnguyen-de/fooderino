<script setup lang="ts">
import { ChevronRight, Plus, Search } from 'lucide-vue-next';
import type { RecipeKind } from '~~/types/cook';
import { normName } from '~~/utils/pantry';
import { eatenText } from '~/utils/cook-format';
const { recipes, today, ready } = useCook();
const query = ref('');
const filter = ref<RecipeKind | 'all'>('all');
const shown = computed(() => {
  const q = normName(query.value);
  return recipes.value.filter(
    (r) =>
      (filter.value === 'all' || r.kind === filter.value) &&
      (!q || normName(r.name).includes(q) || r.ingredients.some((i) => normName(i.name).includes(q)))
  );
});
</script>
<template>
  <NuxtLayout name="app">
    <CookNav />
    <div class="space-y-3 p-3">
      <div class="flex items-baseline justify-between gap-2">
        <h1 class="text-xl font-semibold tracking-tight">Recipes<span class="text-primary">.</span></h1>
        <Button as-child size="sm" class="h-8 gap-1"
          ><NuxtLink to="/cook/recipes/new"><Plus class="size-4" />New</NuxtLink></Button
        >
      </div>
      <div class="flex gap-2">
        <label class="relative min-w-0 flex-1">
          <Search class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            v-model="query"
            aria-label="Search recipes"
            placeholder="Name or ingredient…"
            class="h-9 rounded-lg pl-8 text-base" />
        </label>
        <div role="radiogroup" aria-label="Kind" class="flex shrink-0 gap-0.5 rounded-lg bg-muted p-0.5">
          <button
            v-for="option in [
              { value: 'all', label: 'All' },
              { value: 'dish', label: 'Dish' },
              { value: 'soup', label: 'Soup' }
            ] as const"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="filter === option.value"
            class="rounded-md px-2.5 text-sm font-medium transition-colors"
            :class="filter === option.value ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'"
            @click="filter = option.value">
            {{ option.label }}
          </button>
        </div>
      </div>
      <p v-if="!ready" role="status">Loading recipes…</p>
      <div v-else-if="shown.length" class="divide-y rounded-xl border bg-card">
        <NuxtLink
          v-for="recipe in shown"
          :key="recipe.id"
          :to="`/cook/recipes/${recipe.id}`"
          class="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-muted/50">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate font-semibold">{{ recipe.name }}</span><KindBadge :kind="recipe.kind" />
            </div>
            <div class="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{{ eatenText(recipe.lastEaten, today) }}</span><StockBadge :recipe="recipe" />
            </div>
          </div>
          <ChevronRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </NuxtLink>
      </div>
      <p v-else-if="recipes.length" class="py-4 text-muted-foreground">No recipe matches.</p>
      <div v-else class="space-y-3 rounded-xl border border-dashed p-5 text-center">
        <p class="text-muted-foreground">No recipes yet. Add the dishes and soups you cook, and Cook suggests what to make.</p>
        <Button as-child class="gap-1"
          ><NuxtLink to="/cook/recipes/new"><Plus class="size-4" />Add your first recipe</NuxtLink></Button
        >
      </div>
    </div>
  </NuxtLayout>
</template>
