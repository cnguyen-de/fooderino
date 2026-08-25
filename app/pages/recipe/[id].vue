<script setup lang="ts">
import { useItemStore } from '~/store/item';
import { useRecipeStore } from '~/store/recipes';
import { toast } from 'vue-sonner';
import type { RecipeRecord, RecipeIngredient } from '~~/types/sync';

const recipeStore = useRecipeStore();
const itemStore = useItemStore();
const route = useRoute();
const router = useRouter();
const { byId, update } = useRecipes();

// Recipes are read from Dexie, so the lookup is reactive — no fetch, and no
// re-fetch after an edit.
const recipe = computed(() => byId(route.params.id as string).value);

const onSaveRecipe = async (r: RecipeRecord) => {
  await update(r.id, { saved: true });
  router.push('/recipe');
};

const onAddRecipeIngredientsToBuy = async (r: RecipeRecord) => {
  r.ingredients.forEach((ingredient: RecipeIngredient) => {
    if (recipeStore.hasIngredients(ingredient.name)) {
      return;
    }
    const item = { ...ingredient, amount_to_purchase: ingredient.amount };
    delete item.amount;
    itemStore.insertItem(item);
  });
  toast('Added ingredients to buy list');
};
</script>

<template>
  <NuxtLayout name="app">
    <div class="relative h-full w-full">
      <div class="h-[calc(100%_-_4rem)] w-full overflow-auto p-4">
        <RecipeCard
          v-if="recipe"
          :recipe="recipe"
          @save-recipe="onSaveRecipe($event)"
          @add-recipe-ingredients-to-buy="onAddRecipeIngredientsToBuy($event)"
          hide-delete></RecipeCard>
        <div v-else>
          <p>Recipe not found</p>
        </div>
      </div>
    </div>
  </NuxtLayout>
</template>
