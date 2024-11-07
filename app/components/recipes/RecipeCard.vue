<script setup lang="ts">
import type { Recipe } from '~~/types/Recipe';

interface Props {
  recipe: Recipe;
}
const props = defineProps<Props>();
const emit = defineEmits(['saveRecipe', 'addRecipeIngredientsToBuy', 'generateAnotherRecipe']);
const isOpen = ref(props.recipe?.saved ? false : true);
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
          <Button @click="emit('saveRecipe', props.recipe)"
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
          <Button variant="outline" @click="emit('addRecipeIngredientsToBuy', props.recipe)">🛒</Button>
        </div>
        <Button v-if="!recipe.saved" variant="destructive" @click="emit('generateAnotherRecipe')">Another one?</Button>
      </div>
    </CardFooter>
  </Card>
</template>
