<script setup lang="ts">
import ToggleTheme from '../components/landing-page/ToggleTheme.vue';

const supabase = useSupabaseClient();
const user = useSupabaseUser();
const logout = async () => {
  await supabase.auth.signOut();
  window.location.reload();
};
</script>
<template>
  <NuxtLayout name="app">
    <div class="relative w-full">
      <div class="w-full p-4">
        <div class="flex flex-row items-center justify-between">
          <h1 class="mt-2 text-2xl font-bold">Account</h1>
          <SyncStatus />
        </div>
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
                .map((n: string) => n[0])
                .join('')
            }}</AvatarFallback>
          </Avatar>
        </section>
        <div class="mt-4 flex flex-row justify-end">
          <Button variant="outline" class="text-red-500" @click="logout()">Log out</Button>
        </div>

        <Separator class="my-8" />

        <h1 class="mt-3 text-2xl font-bold">Settings</h1>
        <p class="text-gray-500">Manage your app settings</p>
        <section class="flex flex-row items-center justify-between gap-2 pt-4">
          <h3 class="text-lg">Theme</h3>
          <div class="size-11">
            <ToggleTheme />
          </div>
        </section>

        <Separator class="my-8" />

        <h2 class="mt-3 text-2xl font-bold">Data</h2>
        <p class="text-gray-500">Everything is stored on this device and synced to your account</p>
        <DataSection class="pt-4" />
      </div>
    </div>
  </NuxtLayout>
</template>
