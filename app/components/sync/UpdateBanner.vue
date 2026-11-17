<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { RefreshCw, X } from 'lucide-vue-next';
const { $pwa } = useNuxtApp();
const reloading = ref(false);

// An installed PWA can sit in the background for days, so the hourly timer alone rarely fires.
// Check for a new version whenever the app comes back to the foreground.
let lastCheck = 0;
useEventListener(document, 'visibilitychange', () => {
  if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 60_000) return;
  lastCheck = Date.now();
  $pwa
    ?.getSWRegistration()
    ?.update()
    .catch(() => {});
});

async function reload() {
  reloading.value = true;
  await $pwa?.updateServiceWorker(true);
}
</script>
<template>
  <div
    v-if="$pwa?.needRefresh"
    role="status"
    class="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
    <div
      class="flex w-full max-w-md items-center gap-2 rounded-xl border bg-background/95 py-1.5 pl-3 pr-1 text-sm shadow-lg backdrop-blur-xl">
      <RefreshCw class="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate font-medium">New version available</span>
      <Button size="sm" class="h-8" :disabled="reloading" @click="reload">Reload</Button>
      <Button
        variant="ghost"
        size="icon"
        class="size-8 shrink-0 text-muted-foreground"
        aria-label="Dismiss update"
        @click="$pwa?.cancelPrompt()">
        <X class="size-4" aria-hidden="true" />
      </Button>
    </div>
  </div>
</template>
