<script setup lang="ts">
import { useColorMode, useMediaQuery } from '@vueuse/core';
import { useListStore } from '~/store/list';
import { useAsyncData } from '#app';
import { useSettingsStore } from '~/store/settings';

const listStore = useListStore();
const settingStore = useSettingsStore();
const colorMode = useColorMode();
const isPreferredDark = useMediaQuery('(prefers-color-scheme: dark)');
colorMode.value = isPreferredDark ? 'dark' : 'light';

await useAsyncData('lists', async () => {
  return await listStore.fetchLists();
});
await useAsyncData('userSettings', async () => {
  return await settingStore.fetchSettings();
});
</script>

<template>
  <VitePwaManifest />
  <div class="h-full" vaul-drawer-wrapper id="app">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
