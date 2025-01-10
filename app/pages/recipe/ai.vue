<script setup lang="ts">
import { useChat } from '@ai-sdk/vue';
import { useSettingsStore } from '~/store/settings';
import { useRecipeStore } from '~/store/recipes';

const { messages, input, handleSubmit } = useChat();
const settingsStore = useSettingsStore();
await settingsStore.fetchSettings();
const recipeStore = useRecipeStore();
const useHasIngredients = ref(false);
const request = ref('');
const generateRecipe = async () => {
  await recipeStore.generateRecipe(useHasIngredients.value, request.value);
};
</script>

<template>
  <NuxtLayout name="app">
    <NuxtLayout name="recipe">
      <div v-if="!settingsStore?.settings?.ai" class="w-full p-4">
        <Alert>
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
              d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
          </svg>

          <AlertTitle class="text-xl">Unlock the full potential of AI</AlertTitle>
          <AlertDescription> Custom requests, personalized recipes, and more! Cooming soon! </AlertDescription>
        </Alert>
      </div>
      <div class="relative mx-auto flex w-full flex-col items-start justify-start gap-2 text-white">
        <Input
          v-if="settingsStore?.settings?.ai"
          type="text"
          placeholder="What do you feel like eating today?"
          v-model="request" />
        <div class="mb-2 flex w-full flex-row">
          <Button @click="generateRecipe">
            <span v-if="!recipeStore.generating">Generate recipe 🪄</span>
            <span v-else class="animate-pulse">✨✨✨</span>
          </Button>
          <div class="grow"></div>
          <div class="flex items-center gap-x-2" v-if="!useNoInventoryMode()">
            <label class="text-sm text-gray-400" for="useHasIngredients">Only use ingredients I have</label>
            <Checkbox
              :checked="useHasIngredients"
              @update:checked="useHasIngredients = !useHasIngredients"
              class="size-6 rounded-full"
              id="useHasIngredients" />
          </div>
        </div>

        <GeneratedRecipeList></GeneratedRecipeList>
      </div>
    </NuxtLayout>
  </NuxtLayout>
</template>
