<script setup lang="ts">
import { useSettingsStore } from '~/store/settings';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useForm } from 'vee-validate';
import { toast } from 'vue-sonner';
import ToggleTheme from '../components/landing-page/ToggleTheme.vue';

const supabase = useSupabaseClient();
const user = useSupabaseUser();
const logout = async () => {
  await supabase.auth.signOut();
  window.location.reload();
};
const settingsStore = useSettingsStore();
settingsStore.fetchSettings();
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

const noInventoryMode = ref(settingsStore.settings?.no_inventory);
const updateNoInventoryMode = async (checked: boolean) => {
  noInventoryMode.value = checked;
  await settingsStore.toggleNoInventoryMode(checked);
};

const upgradeToPro = async () => {
  toast('Coming Soon ™️');
};
</script>
<template>
  <NuxtLayout name="app">
    <div class="relative h-full w-full">
      <div class="h-[calc(100%_-_4rem)] w-full overflow-auto p-4">
        <h1 class="mt-2 text-2xl font-bold">Account</h1>
        <section class="flex flex-row justify-between gap-2 pt-4">
          <div class="">
            <h3 class="text-lg">{{ user?.user_metadata?.name }}</h3>
            <p class="text-gray-500">{{ user?.email }}</p>
          </div>
          <Avatar class="size-12">
            <AvatarImage :src="user?.user_metadata.picture" alt="@radix-vue" />
            <AvatarFallback>{{
              user?.user_metadata.name
                ?.split(' ')
                .map((n) => n[0])
                .join('')
            }}</AvatarFallback>
          </Avatar>
        </section>
        <section class="flex flex-row items-center justify-between gap-2 pt-4">
          <div>
            <h3 class="text-lg">Account type</h3>
            <p
              v-if="!settingsStore.settings.ai"
              class="bg-gradient-to-r from-red-600 to-yellow-700 bg-clip-text font-bold text-transparent dark:from-red-500 dark:to-yellow-400">
              <button @click="upgradeToPro">Upgrade to PRO</button>
            </p>
          </div>
          <div v-if="!settingsStore.settings.ai" class="rounded-md border border-solid border-gray-500/50 px-2 py-1">
            <span class="text-gray-600 dark:text-gray-300">Free</span>
          </div>
          <div
            v-else
            class="rounded-md border border-solid bg-gradient-to-r from-red-300/50 to-yellow-300/50 px-2 py-1 dark:from-red-900/50 dark:to-yellow-700/50">
            <span
              class="bg-gradient-to-r from-red-700 to-yellow-600 bg-clip-text font-bold uppercase text-transparent dark:from-red-600 dark:to-yellow-300">
              PRO
            </span>
          </div>
        </section>
        <div class="mt-4 flex flex-row justify-end">
          <Button variant="outline" class="text-red-500" @click="logout()">Log out</Button>
        </div>

        <Separator class="my-8" />

        <h1 class="mt-3 text-2xl font-bold">Settings</h1>
        <p class="text-gray-500">Manage your app settings</p>
        <section class="flex flex-row justify-between gap-2 pt-4">
          <div class="">
            <h3 class="text-lg">No inventory mode</h3>
            <p class="text-gray-500">Use as a checklist for shopping only</p>
          </div>
          <Switch :checked="noInventoryMode" @update:checked="updateNoInventoryMode($event)"></Switch>
        </section>
        <section class="flex flex-row items-center justify-between gap-2 pt-4">
          <h3 class="text-lg">Theme</h3>
          <div class="size-11">
            <ToggleTheme />
          </div>
        </section>

        <Separator class="my-8" />

        <form class="" @submit="onSubmit">
          <h2 class="mt-3 text-2xl font-bold">User</h2>
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
      </div>
    </div>
  </NuxtLayout>
</template>
