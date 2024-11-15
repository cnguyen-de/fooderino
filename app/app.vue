<script setup lang="ts">
import { useColorMode } from '@vueuse/core';
import { useListStore } from '~/store/list';
import { useAsyncData } from '#app';
import { useSettingsStore } from '~/store/settings';

const listStore = useListStore();
const settingStore = useSettingsStore();
const colorMode = useColorMode();
colorMode.value = 'dark';

await useAsyncData('lists', async () => {
  return await listStore.fetchLists();
});
await useAsyncData('userSettings', async () => {
  return await settingStore.fetchSettings();
});
</script>

<template>
  <VitePwaManifest />
  <div class="h-full">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
