<script setup lang="ts">
import HouseholdGate from '~/components/pantry/HouseholdGate.vue';
import PantryNotices from '~/components/pantry/PantryNotices.vue';
import { BookOpen, History, House, Settings, ShoppingBasket } from 'lucide-vue-next';
const hydrated = useState<boolean>('sync-hydrated', () => false);
const route = useRoute();
</script>
<template>
  <div class="mx-auto min-h-dvh max-w-xl bg-background text-foreground sm:border-x">
    <header class="sticky top-0 z-20 space-y-1 border-b bg-background/90 px-3 py-2 backdrop-blur-xl">
      <div class="flex items-center justify-between">
        <NuxtLink
          to="/home"
          class="bg-gradient-to-r from-red-600 to-amber-500 bg-clip-text text-lg font-extrabold tracking-tight text-transparent dark:from-orange-400 dark:to-amber-300"
          >FOODERINO<span class="text-primary">.</span></NuxtLink
        >
        <nav aria-label="Household and more" class="flex items-center">
          <NuxtLink
            to="/household"
            class="rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            :aria-current="route.path === '/household' ? 'page' : undefined"
            >Household</NuxtLink
          >
          <NuxtLink
            to="/logs"
            aria-label="Activity log"
            title="Activity log"
            class="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary"
            :aria-current="route.path === '/logs' ? 'page' : undefined"
            ><History class="size-4" aria-hidden="true"
          /></NuxtLink>
          <NuxtLink
            to="/recipe"
            aria-label="Recipes"
            title="Recipes"
            class="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary"
            :aria-current="route.path.startsWith('/recipe') ? 'page' : undefined">
            <BookOpen class="size-4" aria-hidden="true" />
          </NuxtLink>
          <NuxtLink
            to="/settings"
            aria-label="Settings"
            title="Settings"
            class="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary"
            :aria-current="route.path === '/settings' ? 'page' : undefined">
            <Settings class="size-4" aria-hidden="true" />
          </NuxtLink>
        </nav>
      </div>
      <nav aria-label="Main navigation" class="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5">
        <NuxtLink
          v-for="tab in [
            { path: '/home', name: 'Home', icon: House },
            { path: '/shop', name: 'Shopping', icon: ShoppingBasket }
          ]"
          :key="tab.path"
          :to="tab.path"
          :aria-current="route.path === tab.path ? 'page' : undefined"
          class="flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          :class="
            route.path === tab.path
              ? 'bg-background text-primary shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          "
          ><component :is="tab.icon" class="size-4" aria-hidden="true" />{{ tab.name }}</NuxtLink
        >
      </nav>
    </header>
    <main class="pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <p v-if="!hydrated" class="p-4" role="status">Loading your household…</p>
      <HouseholdGate v-else-if="['/home', '/shop', '/household', '/logs'].includes(route.path)"><slot /></HouseholdGate>
      <slot v-else />
    </main>
    <PantryNotices v-if="hydrated" />
  </div>
</template>
