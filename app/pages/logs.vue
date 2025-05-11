<script setup lang="ts">
import { useLogStore } from '~/store/logs';

const logStore = useLogStore();
logStore.fetchLogs();
</script>

<template>
  <NuxtLayout name="app">
    <div class="relative h-full w-full">
      <div class="h-[calc(100%_-_4rem)] w-full overflow-auto p-4">
        <h3 class="pb-4 text-xl font-bold">Logs</h3>
        <div v-if="logStore.logs.length">
          <ul class="flex flex-col gap-2">
            <li v-for="log in logStore.logs" :key="log.id">
              <div class="flex w-full flex-row items-center justify-between rounded-lg border border-gray-300 p-2">
                <span>
                  {{ log.item }}
                  <LogAction :log="log" />
                </span>
                <span class="text-sm text-gray-500 dark:text-gray-400" v-if="log.created_at">
                  <span v-if="log.payload" class="ml-1 inline-block rounded px-2 italic">
                    <span class="text-sm font-bold tabular-nums text-white">{{ log.payload }}</span>
                  </span>
                  <span class="tabular-nums tracking-tight">
                    {{
                      new Date(log.created_at).toLocaleString('de-DE', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })
                    }}
                  </span>
                </span>
              </div>
            </li>
          </ul>
        </div>
        <div v-else>No logs available.</div>
      </div>
    </div>
  </NuxtLayout>
</template>
