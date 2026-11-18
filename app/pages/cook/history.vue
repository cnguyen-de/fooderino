<script setup lang="ts">
import { dateText } from '~/utils/cook-format';
const { meals, today, ready } = useCook();
const limit = ref(30);
</script>
<template>
  <NuxtLayout name="app">
    <CookNav />
    <div class="space-y-3 p-3">
      <h1 class="text-xl font-semibold tracking-tight">Meals<span class="text-primary">.</span></h1>
      <p v-if="!ready" role="status">Loading…</p>
      <template v-else-if="meals.length">
        <MealCard v-for="meal in meals.slice(0, limit)" :key="meal.date" :meal="meal" :title="dateText(meal.date, today)" />
        <Button v-if="meals.length > limit" variant="ghost" class="w-full" @click="limit += 30">Show older meals</Button>
      </template>
      <p v-else class="py-4 text-muted-foreground">
        No meals yet. Add a recipe to today’s meal from
        <NuxtLink to="/cook" class="text-primary underline">Today</NuxtLink>.
      </p>
    </div>
  </NuxtLayout>
</template>
