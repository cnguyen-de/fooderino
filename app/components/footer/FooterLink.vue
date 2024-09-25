<script setup lang="ts">
  defineProps<{ link: string }>();
</script>

<template>
  <div class="p-1 mx-auto">
    <NuxtLink class="text-gray-300 font-bold h-full" :to="link"><slot></slot></NuxtLink>
  </div>
</template>
