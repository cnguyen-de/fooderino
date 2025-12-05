<script setup lang="ts">
import { useColorMode, useMediaQuery } from '@vueuse/core';
import { useListStore } from '~/store/list';
import { useSettingsStore } from '~/store/settings';
import { Toaster } from '~/components/ui/sonner';
import { useStorage } from '@vueuse/core';

const listStore = useListStore();
const settingStore = useSettingsStore();
const user = useSupabaseUser();

// Fetch data in parallel without blocking initial render
onMounted(async () => {
  if (user.value) {
    await Promise.all([listStore.fetchLists(), settingStore.fetchSettings()]);
  }
});

const colorMode = useColorMode();
const isPreferredDark = useMediaQuery('(prefers-color-scheme: dark)');
const userColor = useStorage('userColor', `${isPreferredDark.value ? 'dark' : 'light'}`);

colorMode.value = userColor.value ? userColor.value : isPreferredDark.value ? 'dark' : 'light';
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
