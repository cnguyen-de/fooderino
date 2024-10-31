<script setup lang="ts">
import { useListStore } from './store/list';

const listStore = useListStore();
onMounted(() => {
  const colorMode = useColorMode();
  colorMode.preference = 'dark';
  listStore.fetchLists();
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
