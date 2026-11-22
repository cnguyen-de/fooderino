<script setup lang="ts">
import { Search } from 'lucide-vue-next';
import type { RecipeId } from '~~/types/cook';
const emit = defineEmits<{ pick: [id: RecipeId] }>();
const { findRecipes } = useCook();
const query = ref('');
const picks = computed(() => findRecipes(query.value));
function pick(id: RecipeId) {
  query.value = '';
  emit('pick', id);
}
</script>
<template>
  <div class="space-y-1">
    <label class="relative block">
      <Search class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
      <Input
        v-model="query"
        aria-label="Find a recipe"
        placeholder="Find a recipe…"
        class="h-9 rounded-lg pl-8 text-base" />
    </label>
    <button
      v-for="r in picks"
      :key="r.id"
      type="button"
      class="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left transition-colors hover:bg-muted"
      @click="pick(r.id)">
      <span class="min-w-0 flex-1 truncate font-medium">{{ r.name }}</span
      ><KindBadge :kind="r.kind" /><StockBadge :recipe="r" />
    </button>
    <p v-if="query.trim() && !picks.length" class="px-1 text-sm text-muted-foreground">
      No recipe matches. <NuxtLink to="/cook/recipes/new" class="text-primary underline">Create one</NuxtLink>
    </p>
  </div>
</template>
