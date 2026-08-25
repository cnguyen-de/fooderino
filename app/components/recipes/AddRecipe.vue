<script setup lang="ts">
import * as z from 'zod';
import { useRecipeStore } from '~/store/recipes';

const isAddRecipeDrawerOpen = ref(false);
const recipeStore = useRecipeStore();
const schema = z.object({
  name: z.string().optional(),
  ingredients: z
    .array(
      z.object({
        name: z.string().optional(),
        amount: z.number().optional()
      })
    )
    .describe('Ingredients for the recipe')
});
const saveChanges = async (values: z.infer<typeof schema>) => {
  await recipeStore.insertRecipe({
    name: values.name ?? '',
    description: null,
    // The form has no amount_type field; count is the neutral default.
    ingredients: (values.ingredients ?? []).map((i) => ({
      name: i.name ?? '',
      amount: i.amount,
      amount_type: 'count' as const
    })),
    instructions: null,
    // Saved, not generated: this drawer sits on /recipe, which renders
    // `savedRecipes`. Inserting with saved=false — what the legacy call did —
    // put the new recipe on a page the user cannot see.
    saved: true
  });
  isAddRecipeDrawerOpen.value = false;
};
</script>
<template>
  <Drawer v-model:open="isAddRecipeDrawerOpen" @onOpenChange="isAddRecipeDrawerOpen = $event">
    <DrawerTrigger class="pr-2 text-gray-400">
      <Button variant="outline">Add New Recipe</Button>
    </DrawerTrigger>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle> Add new Recipe</DrawerTitle>
      </DrawerHeader>
      <DrawerDescription>
        <AutoForm class="px-2" :schema="schema" @submit="saveChanges">
          <div class="flex w-full justify-between">
            <DrawerClose>
              <Button variant="ghost" class="text-red-500"> Cancel </Button>
            </DrawerClose>
            <Button type="submit"> Add Recipe </Button>
          </div>
        </AutoForm>
      </DrawerDescription>
    </DrawerContent>
  </Drawer>
</template>
