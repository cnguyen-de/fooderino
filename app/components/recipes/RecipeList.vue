<script setup lang="ts">
import { useRecipeStore } from '~/store/recipes';
import { useItemStore } from '~/store/item';
import { toast } from 'vue-sonner';
const recipeStore = useRecipeStore();
const itemStore = useItemStore();
recipeStore.fetchRecipes();

// TODO
const onAddRecipeIngredientsToBuy = (recipe) => {
  recipe.ingredients.forEach((ingredient) => {
    if (recipeStore.hasIngredients(ingredient.name)) {
      return;
    }
    const item = { ...ingredient, amount_to_purchase: ingredient.amount };
    delete item.amount;
    itemStore.insertItem(item);
  });
  toast('Added ingredients to buy list');
};

const onSaveRecipe = (recipe) => {
  if (!recipe.saved) {
    recipeStore.insertRecipe(recipe);
  } else {
    console.log('what do, remove recipe?');
  }
};
</script>

<template>
  <RecipeCard
    :recipe="recipe"
    v-for="recipe of recipeStore.savedRecipes"
    @save-recipe="onSaveRecipe($event)"
    @add-recipe-ingredients-to-buy="onAddRecipeIngredientsToBuy"
    @delete="recipeStore.deleteRecipe(recipe)"></RecipeCard>
</template>

<style scoped></style>
