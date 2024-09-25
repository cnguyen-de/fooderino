<script setup lang="ts">
  defineProps<{ link: string }>();
</script>

<template>
  <div class="p-1 mx-auto">
    <NuxtLink :to="link"><slot></slot></NuxtLink>
  </div>
</template>
