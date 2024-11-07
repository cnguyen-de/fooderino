<script setup lang="ts">
import { useRecipeStore } from '~/store/recipes';
const recipeStore = useRecipeStore();
recipeStore.fetchRecipes();

const onAddRecipeIngredientsToBuy = (recipe) => {
  recipe.ingredients.forEach((ingredient) => {
    console.log('Adding ingredient to buy:', ingredient);
  });
};
</script>

<template>
  <RecipeCard
    :recipe="recipe"
    v-for="recipe of recipeStore.recipes"
    @save-recipe="recipeStore.insertRecipe($event)"
    @add-recipe-ingredients-to-buy="onAddRecipeIngredientsToBuy"
    @generate-another-recipe="recipeStore.generateRecipe()"></RecipeCard>
</template>

<style scoped></style>
