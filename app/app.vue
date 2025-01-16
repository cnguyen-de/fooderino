<script setup lang="ts">
import { useColorMode, useMediaQuery } from '@vueuse/core';
import { useListStore } from '~/store/list';
import { useSettingsStore } from '~/store/settings';
import { Toaster } from '~/components/ui/sonner';
import { useStorage } from '@vueuse/core';

const listStore = useListStore();
const settingStore = useSettingsStore();
const user = useSupabaseUser();
if (user.value) {
  await listStore.fetchLists();
  await settingStore.fetchSettings();
}

const colorMode = useColorMode();
const isPreferredDark = useMediaQuery('(prefers-color-scheme: dark)');
const userColor = useStorage('userColor', `${isPreferredDark ? 'dark' : 'light'}`);

colorMode.value = userColor.value ? userColor.value : isPreferredDark ? 'dark' : 'light';
</script>

<template>
  <VitePwaManifest />
  <div class="h-full" vaul-drawer-wrapper id="app">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
  <Toaster />
</template>
