<script setup lang="ts">
import { useChat } from '@ai-sdk/vue';
import { useSettingsStore } from '~/store/settings';
import { useRecipeStore } from '~/store/recipes';

const { messages, input, handleSubmit } = useChat();
const settingsStore = useSettingsStore();
await settingsStore.fetchSettings();
const recipeStore = useRecipeStore();
const useHasIngredients = ref(false);
const generateRecipe = async () => {
  await recipeStore.generateRecipe(useHasIngredients.value);
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
              d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" />
          </svg>

          <AlertTitle class="text-xl">AI functionality is under development</AlertTitle>
          <AlertDescription>
            Only a handful of users are currently beta testing, please wait for new update!
          </AlertDescription>
        </Alert>
      </div>
      <div
        v-else
        class="relative mx-auto flex w-full flex-col items-start justify-start gap-2 overflow-y-scroll text-white">
        <Alert class="mb-2">
          <AlertTitle class="text-xl">🚧 AI functionality is under development</AlertTitle>
          <AlertDescription> Some functions are not working properly yet! </AlertDescription>
        </Alert>
        <!-- <Input type="text" v-model="request" /> -->
        <div class="flex flex-row">
          <Button @click="generateRecipe">
            <span v-if="!recipeStore.generating">Generate recipe 🪄</span>
            <span v-else class="animate-pulse">✨✨✨</span>
          </Button>
          <div class="flex items-center gap-x-2">
            <Checkbox v-model="useHasIngredients" class="ml-4" id="useHasIngredients" />
            <label class="text-sm text-gray-400" for="useHasIngredients">Only use ingredients I have</label>
          </div>
        </div>

        <GeneratedRecipeList></GeneratedRecipeList>
      </div>
    </NuxtLayout>
  </NuxtLayout>
</template>
