<script setup lang="ts">
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
    recipeStore.updateRecipe(recipe);
  } else {
    console.log('what do, remove recipe?');
  }
};

const onDeleteRecipe = (recipe) => {
  console.log('delete recipe', recipe);
  recipeStore.deleteRecipe(recipe);
};
</script>

<template>
  <RecipeCard
    :recipe="recipe"
    v-for="recipe of recipeStore.savedRecipes"
    :hide-add-to-cart="!listStore.selectedList"
    @save-recipe="onSaveRecipe($event)"
    @add-recipe-ingredients-to-buy="onAddRecipeIngredientsToBuy($event)"
    @delete="onDeleteRecipe($event)"
    :hide-delete="false"></RecipeCard>
</template>

<style scoped></style>
