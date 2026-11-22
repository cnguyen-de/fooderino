<script setup lang="ts">
import { Plus } from 'lucide-vue-next';
import type { RecipeId } from '~~/types/cook';
import { eatenText, KIND_TEXT } from '~/utils/cook-format';
const cook = useCook();
const { recipes, todayMeal, suggestions, today, ready } = cook;
const cooking = ref<RecipeId | null>(null);
const open = computed({
  get: () => cooking.value !== null,
  set: (value) => {
    if (!value) cooking.value = null;
  }
});
const sections = computed(() =>
  [
    { title: KIND_TEXT.soup.many, list: suggestions.value.soups },
    { title: KIND_TEXT.dish.many, list: suggestions.value.dishes },
    { title: KIND_TEXT.whole_meal.many, list: suggestions.value.wholeMeals }
  ].filter((s) => s.list.length)
);
function add(id: RecipeId) {
  cooking.value = id;
}
</script>
<template>
  <NuxtLayout name="app">
    <CookNav />
    <div class="space-y-4 p-3">
      <h1 class="text-xl font-semibold tracking-tight">What’s for dinner<span class="text-primary">?</span></h1>
      <p v-if="!ready" role="status">Loading…</p>
      <template v-else>
        <MealCard :meal="todayMeal" title="Today" />
        <div
          v-if="!recipes.length && !todayMeal.dishes.length && !todayMeal.ingredients.length"
          class="space-y-3 rounded-xl border border-dashed p-5 text-center">
          <p class="text-muted-foreground">
            Add the dishes and soups you cook. Cook then suggests what to make from what is at home, and keeps a history
            of your meals.
          </p>
          <Button as-child class="gap-1"
            ><NuxtLink to="/cook/recipes/new"><Plus class="size-4" />Add your first recipe</NuxtLink></Button
          >
        </div>
        <template v-else>
          <section v-for="section in sections" :key="section.title" class="space-y-1">
            <h2 class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Suggested {{ section.title.toLowerCase() }}
            </h2>
            <div
              v-for="s in section.list"
              :key="s.recipe.id"
              class="flex items-center gap-2 rounded-lg border bg-card py-1.5 pl-3 pr-1.5">
              <NuxtLink :to="`/cook/recipes/${s.recipe.id}`" class="min-w-0 flex-1">
                <span class="block truncate font-semibold">{{ s.recipe.name }}</span>
                <span class="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground"
                  ><span>{{ eatenText(s.recipe.lastEaten, today) }}</span
                  ><span v-if="s.recipe.short" class="text-orange-700 dark:text-orange-300"
                    >{{ s.recipe.short }} short</span
                  ><span v-if="s.expiring" class="text-orange-700 dark:text-orange-300"
                    >uses {{ s.expiring }} to use soon</span
                  ></span
                >
              </NuxtLink>
              <Button
                size="sm"
                class="h-8 shrink-0 gap-1"
                :aria-label="`Add ${s.recipe.name}`"
                @click="add(s.recipe.id)"
                ><Plus class="size-4" />Add</Button
              >
            </div>
          </section>
          <p
            v-if="!sections.length && (todayMeal.needs.soup || todayMeal.needs.dishes)"
            class="text-sm text-muted-foreground">
            No suggestions right now. A recipe is suggested when it has an ingredient tracked at home and none of them
            has run out.
          </p>
          <section class="space-y-1">
            <h2 class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Add another recipe
            </h2>
            <RecipePicker @pick="add" />
          </section>
        </template>
      </template>
    </div>
    <CookSheet v-model:open="open" :recipe="cooking ? cook.recipe(cooking) : undefined" />
  </NuxtLayout>
</template>
