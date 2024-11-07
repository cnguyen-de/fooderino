<script setup lang="ts">
import type { Recipe } from '~~/types/Recipe';

interface Props {
  recipe: Recipe;
}
const props = defineProps<Props>();
const emit = defineEmits(['saveRecipe', 'addRecipeIngredientsToBuy', 'generateAnotherRecipe']);
const isOpen = ref(true);
</script>

<template>
  <Card v-if="recipe" class="w-full">
    <Collapsible v-model:open="isOpen">
      <CollapsibleTrigger>
        <CardHeader>
          <CardTitle>
            {{ recipe?.name }}
          </CardTitle>
          <CardDescription> {{ recipe?.description }} ▾</CardDescription>
        </CardHeader>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <CardContent>
          <div class="grid grid-cols-2">
            <ul>
              <li v-for="ingredient of recipe?.ingredients" :key="ingredient.name">
                {{ ingredient.name }}
              </li>
            </ul>
            <ul class="text-right">
              <li v-for="ingredient of recipe?.ingredients" :key="ingredient.name">
                {{ ingredient.amount }} {{ ingredient.amount_type === 'gram' ? 'g' : '' }}
              </li>
            </ul>
          </div>
        </CardContent>
      </CollapsibleContent>
    </Collapsible>

    <CardFooter>
      <div class="flex w-full flex-row justify-between">
        <div class="flex flex-row gap-4">
          <Button @click="emit('saveRecipe', props.recipe)">♥️</Button>
          <Button variant="outline" @click="emit('addRecipeIngredientsToBuy', props.recipe)">🛒</Button>
        </div>
        <Button variant="destructive" @click="emit('generateAnotherRecipe')">Another one?</Button>
      </div>
    </CardFooter>
  </Card>
</template>
