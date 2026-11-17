<script setup lang="ts">
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from 'lucide-vue-next';

const { status, lastSyncedAt, checkMembership } = useSyncEngine();

const label = computed(() => {
  if (status.value === 'syncing') return 'Syncing…';
  if (status.value === 'offline') return 'Offline — changes are saved locally';
  if (status.value === 'error') return 'Sync delayed — retry now';
  return lastSyncedAt.value
    ? `Synced ${new Date(lastSyncedAt.value).toLocaleTimeString()}`
    : 'Synced';
});
</script>

<template>
  <button
    class="flex flex-row items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
    @click="checkMembership">
    <RefreshCw v-if="status === 'syncing'" class="size-4 animate-spin" />
    <CloudOff v-else-if="status === 'offline'" class="size-4" />
    <TriangleAlert v-else-if="status === 'error'" class="size-4 text-red-500" />
    <Cloud v-else class="size-4" />
    <span>{{ label }}</span>
  </button>
</template>
