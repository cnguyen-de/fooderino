<script setup lang="ts">
const route = useRoute();
const tabs = [
  { path: '/cook', name: 'Today' },
  { path: '/cook/recipes', name: 'Recipes' },
  { path: '/cook/history', name: 'History' }
];
const active = (path: string) =>
  path === '/cook' ? route.path === '/cook' : route.path === path || route.path.startsWith(path + '/');
</script>
<template>
  <nav aria-label="Cook" class="grid grid-cols-3 border-b">
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.path"
      :to="tab.path"
      :aria-current="active(tab.path) ? 'page' : undefined"
      class="-mb-px border-b-2 py-2 text-center text-sm font-medium transition-colors"
      :class="
        active(tab.path)
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      "
      >{{ tab.name }}</NuxtLink
    >
  </nav>
</template>
