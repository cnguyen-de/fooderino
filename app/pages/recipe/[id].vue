<script setup lang="ts">
import { useRecipeStore } from '~/store/recipes';
import type { RecipeRecord, RecipeIngredient } from '~~/types/sync';

const recipeStore = useRecipeStore();
const { addIngredients } = useRecipeShopping();
const { state: householdState } = useHousehold();
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

const onAddRecipeIngredientsToBuy = async (recipe: RecipeRecord) => {
  await addIngredients(recipe.ingredients);
};
</script>

<template>
  <NuxtLayout name="app">
    <div class="relative w-full">
      <div class="w-full p-4">
        <RecipeCard
          v-if="recipe"
          :recipe="recipe"
          :hide-add-to-cart="householdState.kind !== 'member'"
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
