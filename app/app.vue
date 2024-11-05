<script setup lang="ts">
import { useColorMode } from '@vueuse/core';
import { useListStore } from '~/store/list';
import { useSettingsStore } from '~/store/settings';
import { useAsyncData } from '#app';

const listStore = useListStore();
const settingsStore = useSettingsStore();
onMounted(async () => {
  const colorMode = useColorMode({ emitAuto: true });
  colorMode.value = 'dark';
});
await useAsyncData('lists', async () => {
  return await listStore.fetchLists();
});
await useAsyncData('settings', async () => {
  return await settingsStore.fetchSettings();
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
