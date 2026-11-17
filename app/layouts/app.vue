<script setup lang="ts">
import HouseholdGate from '~/components/pantry/HouseholdGate.vue';
import PantryNotices from '~/components/pantry/PantryNotices.vue';
import { BookOpen, Settings } from 'lucide-vue-next';
const { hydrated } = useSyncBootstrap();
const route = useRoute();
</script>
<template>
  <div class="mx-auto min-h-dvh max-w-xl bg-background text-foreground">
    <header class="sticky top-0 z-20 space-y-3 border-b bg-background/95 p-4 backdrop-blur">
      <div class="flex items-center justify-between">
        <NuxtLink to="/home" class="text-lg font-extrabold tracking-wide text-primary">FOODERINO</NuxtLink>
        <nav aria-label="Household and more" class="flex items-center">
          <NuxtLink to="/household" class="p-2 text-sm">Household</NuxtLink>
          <NuxtLink
            to="/recipe"
            aria-label="Recipes"
            title="Recipes"
            class="flex size-11 items-center justify-center rounded-lg hover:bg-muted"
            :aria-current="route.path.startsWith('/recipe') ? 'page' : undefined">
            <BookOpen class="size-5" aria-hidden="true" />
          </NuxtLink>
          <NuxtLink
            to="/settings"
            aria-label="Settings"
            title="Settings"
            class="flex size-11 items-center justify-center rounded-lg hover:bg-muted"
            :aria-current="route.path === '/settings' ? 'page' : undefined">
            <Settings class="size-5" aria-hidden="true" />
          </NuxtLink>
        </nav>
      </div>
      <nav aria-label="Main navigation" class="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        <NuxtLink
          v-for="tab in [
            { path: '/home', name: 'Home' },
            { path: '/shop', name: 'Shopping' }
          ]"
          :key="tab.path"
          :to="tab.path"
          :aria-current="route.path === tab.path ? 'page' : undefined"
          class="rounded-lg p-3 text-center font-medium"
          :class="route.path === tab.path ? 'bg-background shadow-sm' : 'text-muted-foreground'"
          >{{ tab.name }}</NuxtLink
        >
      </nav>
    </header>
    <main class="pb-28">
      <p v-if="!hydrated" class="p-4" role="status">Loading your household…</p>
      <HouseholdGate v-else-if="['/home', '/shop', '/household'].includes(route.path)"><slot /></HouseholdGate>
      <slot v-else />
    </main>
    <PantryNotices v-if="hydrated" />
  </div>
</template>
