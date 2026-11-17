<script setup lang="ts">
import { useColorMode, useMediaQuery } from '@vueuse/core';
import { Toaster } from '~/components/ui/sonner';
import { useStorage } from '@vueuse/core';

// One bootstrap for the signed-in session, independent of page/layout mounts.
useSyncBootstrap();

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
  <Toaster position="top-center" :visible-toasts="2" />
  <UpdateBanner />
</template>
