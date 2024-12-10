<script setup lang="ts">
import { useSettingsStore } from '~/store/settings';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useForm } from 'vee-validate';
import { toast } from 'vue-sonner';

const supabase = useSupabaseClient();
const logout = async () => {
  await supabase.auth.signOut();
  window.location.reload();
};
const settingsStore = useSettingsStore();
const settings = await useAsyncData('lists', async () => {
  return await settingsStore.fetchSettings();
});
const formSchema = toTypedSchema(
  z.object({
    servings: z
      .number()
      .min(1)
      .max(50)
      .default(settingsStore.settings?.servings ?? 0),
    allergies: z
      .string()
      .min(2)
      .max(500)
      .default(settingsStore.settings?.allergies ?? ''),
    cuisines: z
      .string()
      .min(2)
      .max(500)
      .default(settingsStore.settings?.cuisines ?? '')
  })
);
const form = useForm({
  validationSchema: formSchema
});
const onSubmit = form.handleSubmit(async (values) => {
  await settingsStore.updateSettings(values);
  toast('Successfully saved settings');
});
</script>
<template>
  <NuxtLayout name="app">
    <div class="flex h-[calc(100%_-_4rem)] flex-col justify-center p-4">
      <h1 class="text-2xl font-bold">User Settings</h1>
      <p class="text-gray-500">Manage your account settings</p>
      <div class="my-4 border-b border-solid border-gray-500/50"></div>
      <form class="" @submit="onSubmit">
        <h2 class="mt-3 text-xl font-bold">Recipe Generation Preferences</h2>
        <p class="text-gray-500">Set your preferences for recipe generation</p>

        <h3 class="mt-4 text-lg">Servings</h3>
        <p class="text-gray-500">Default servings for recipe generation</p>
        <FormField v-slot="{ componentField }" name="servings">
          <FormItem>
            <FormControl>
              <Input type="number" placeholder="Number of servings" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <h3 class="mt-4 text-lg">Allergies</h3>
        <p class="text-gray-500">List your food allergies. Separate using comma (,)</p>
        <FormField v-slot="{ componentField }" name="allergies">
          <FormItem>
            <FormControl>
              <Input type="text" placeholder="Food allergies" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <h3 class="mt-4 text-lg">Favorite Cuisines</h3>
        <p class="text-gray-500">Your favorite cuisines or food type. Separate using comma (,)</p>
        <FormField v-slot="{ componentField }" name="cuisines">
          <FormItem>
            <FormControl>
              <Input type="text" placeholder="Favorite cuisines" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <Button class="mt-4" type="submit" @click.prevent="onSubmit">Save changes</Button>
      </form>

      <div class="flex-grow"></div>
      <div class="mb-2 w-full">
        <Button variant="outline" class="mt-3 w-full text-red-500" @click="logout()">Log out</Button>
      </div>
    </div>
  </NuxtLayout>
</template>
