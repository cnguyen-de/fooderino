<script setup lang="ts">
import * as z from 'zod';
import { useRecipeStore } from '~/store/recipes';
import type { Recipe } from '~~/types/Recipe';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';

interface Props {
  recipe: Recipe;
}

const props = defineProps<Props>();
const emit = defineEmits(['updated']);

const isEditRecipeDrawerOpen = ref(false);
const recipeStore = useRecipeStore();

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1, 'Ingredient name is required'),
        amount: z.number().optional()
      })
    )
    .min(1, 'At least one ingredient is required')
    .describe('Ingredients for the recipe'),
  instructions: z.string().optional()
});

const form = useForm({
  validationSchema: toTypedSchema(schema),
  initialValues: {
    name: props.recipe.name,
    description: props.recipe.description || '',
    ingredients: props.recipe.ingredients || [],
    instructions: props.recipe.instructions || ''
  }
});

// Reset form values when drawer opens or recipe changes
watch([() => props.recipe, isEditRecipeDrawerOpen], () => {
  if (isEditRecipeDrawerOpen.value) {
    form.resetForm({
      values: {
        name: props.recipe.name,
        description: props.recipe.description || '',
        ingredients: props.recipe.ingredients || [],
        instructions: props.recipe.instructions || ''
      }
    });
  }
});

const saveChanges = async (values) => {
  const updatedRecipe = {
    ...props.recipe,
    ...values
  };
  await recipeStore.updateRecipe(updatedRecipe);
  isEditRecipeDrawerOpen.value = false;
  emit('updated');
};
</script>

<template>
  <Drawer v-model:open="isEditRecipeDrawerOpen">
    <DrawerTrigger as-child>
      <Button variant="outline">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="size-5">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
        </svg>
      </Button>
    </DrawerTrigger>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>Edit Recipe</DrawerTitle>
      </DrawerHeader>
      <DrawerDescription class="max-h-[70vh] overflow-y-auto">
        <AutoForm
          class="px-2"
          :schema="schema"
          :form="form"
          :field-config="{
            name: { label: 'Recipe Name' },
            description: { label: 'Description', component: 'textarea', inputProps: { rows: 3 } },
            ingredients: { label: 'Ingredients' },
            instructions: { label: 'Instructions', component: 'textarea', inputProps: { rows: 5 } }
          }"
          @submit="saveChanges">
          <div class="flex w-full justify-between">
            <DrawerClose>
              <Button variant="ghost" class="text-red-500">Cancel</Button>
            </DrawerClose>
            <Button type="submit">Save Changes</Button>
          </div>
        </AutoForm>
      </DrawerDescription>
    </DrawerContent>
  </Drawer>
</template>
