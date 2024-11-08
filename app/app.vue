<script setup lang="ts">
import { useColorMode } from '@vueuse/core';
import { useListStore } from '~/store/list';
import { useAsyncData } from '#app';

const listStore = useListStore();
const colorMode = useColorMode();
colorMode.value = 'dark';

await useAsyncData('lists', async () => {
  return await listStore.fetchLists();
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
