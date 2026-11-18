<script setup lang="ts">
import type { RecipeId } from '~~/types/cook';
const route = useRoute();
const { recipe, ready } = useCook();
const current = computed(() => recipe(route.params.id as RecipeId));
</script>
<template>
  <NuxtLayout name="app">
    <CookNav />
    <div class="space-y-3 p-3">
      <h1 class="text-xl font-semibold tracking-tight">Edit recipe<span class="text-primary">.</span></h1>
      <p v-if="!ready" role="status">Loading…</p>
      <RecipeEditor v-else-if="current" :key="current.id" :recipe="current" />
      <p v-else class="text-muted-foreground">
        This recipe is gone. <NuxtLink to="/cook/recipes" class="text-primary underline">Back to recipes</NuxtLink>
      </p>
    </div>
  </NuxtLayout>
</template>
