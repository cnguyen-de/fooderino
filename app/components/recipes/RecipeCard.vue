<script setup lang="ts">
import type { Recipe } from '~~/types/Recipe';
import { useRecipeStore } from '~/store/recipes';
interface Props {
  recipe: Recipe;
}
const props = defineProps<Props>();
const emit = defineEmits(['saveRecipe', 'addRecipeIngredientsToBuy', 'delete']);
const isOpen = ref(!props.recipe?.saved);

const recipeStore = useRecipeStore(); // probably use a util instead
</script>

<template>
  <Card v-if="recipe" class="w-full bg-background/30">
    <Collapsible v-model:open="isOpen">
      <CollapsibleTrigger>
        <CardHeader>
          <CardTitle>
            {{ recipe?.name }}
          </CardTitle>
          <CardDescription v-if="recipe?.description"> {{ recipe.description }} ▾</CardDescription>
        </CardHeader>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <CardContent>
          <div class="grid grid-cols-2">
            <ul>
              <li
                v-for="ingredient of recipe?.ingredients"
                :key="ingredient.name"
                :class="recipeStore.hasIngredients(ingredient.name) ? 'text-green-500' : 'text-gray-200'">
                <span>{{ ingredient.name }}</span>
                <span v-if="recipeStore.hasIngredients(ingredient.name)" class="ml-1 inline-block h-4"
                  ><svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1.5"
                    stroke="currentColor"
                    class="size-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </span>
              </li>
            </ul>
            <ul class="text-right">
              <li v-for="ingredient of recipe?.ingredients" :key="ingredient.name">
                {{ ingredient.amount }} {{ ingredient.amount_type === 'gram' ? 'g' : '' }}
              </li>
            </ul>
          </div>
          <div v-if="recipe?.instructions">
            <h4 class="mt-2 font-bold">Instructions</h4>
            <MarkdownRenderer class="ml-4" :source="recipe?.instructions"></MarkdownRenderer>
          </div>
        </CardContent>
      </CollapsibleContent>
    </Collapsible>

    <CardFooter>
      <div class="flex w-full flex-row justify-between">
        <div class="flex flex-row gap-3">
          <Button variant="outline" class="text-red-700" @click="emit('saveRecipe', props.recipe)"
            ><svg
              xmlns="http://www.w3.org/2000/svg"
              :fill="recipe.saved ? 'currentColor' : 'none'"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="size-6">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
          </Button>
          <Button variant="outline" @click="emit('addRecipeIngredientsToBuy', props.recipe)">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="size-6">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
          </Button>
        </div>
        <Button variant="ghost" class="text-red-500" @click="emit('delete', props.recipe)"
          ><svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="size-6">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </Button>
      </div>
    </CardFooter>
  </Card>
</template>
