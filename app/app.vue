<script setup lang="ts">
import { useColorMode, useMediaQuery } from '@vueuse/core';
import { useSettingsStore } from '~/store/settings';
import { Toaster } from '~/components/ui/sonner';
import { useStorage } from '@vueuse/core';

const settingStore = useSettingsStore();
const user = useSupabaseUser();

// Lists are no longer fetched here — `useLists()` subscribes to Dexie and the
// sync engine keeps it fed, so there is nothing to kick off on mount.
onMounted(async () => {
  if (user.value) {
    await settingStore.fetchSettings();
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
