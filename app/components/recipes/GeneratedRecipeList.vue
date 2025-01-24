<script setup lang="ts">
// Basically copy of RecipeList, make composable or layout component instead
import { useRecipeStore } from '~/store/recipes';
import { useItemStore } from '~/store/item';
import { toast } from 'vue-sonner';
import { useListStore } from '~/store/list';
const recipeStore = useRecipeStore();
const itemStore = useItemStore();
const listStore = useListStore();
recipeStore.fetchRecipes();

const onAddRecipeIngredientsToBuy = (recipe) => {
  recipe.ingredients.forEach((ingredient) => {
    const item = { ...ingredient, amount_to_purchase: ingredient.amount };
    delete item.amount;
    itemStore.insertItem(item);
  });
  toast('Added ingredients to buy list');
};

const onSaveRecipe = (recipe) => {
  if (!recipe.saved) {
    recipeStore.updateRecipe(recipe);
  } else {
    console.log('what do, remove recipe?');
  }
};

const onDeleteRecipe = (recipe) => {
  toast(`Deleted ${recipe?.name}`);
  recipeStore.deleteRecipe(recipe);
};
</script>

<template>
  <RecipeCard
    :recipe="recipe"
    v-for="recipe of recipeStore.generatedRecipes"
    :hide-add-to-cart="!listStore.selectedList"
    @save-recipe="onSaveRecipe($event)"
    @add-recipe-ingredients-to-buy="onAddRecipeIngredientsToBuy($event)"
    @delete="onDeleteRecipe($event)"></RecipeCard>
</template>

<style scoped></style>
