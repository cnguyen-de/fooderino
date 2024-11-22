<script setup lang="ts">
import RecipeList from '~/components/recipes/RecipeList.vue';

definePageMeta({ layout: false });
</script>
<template>
  <NuxtLayout name="app">
    <NuxtLayout name="recipe">
      <RecipeList></RecipeList>
    </NuxtLayout>
  </NuxtLayout>
</template>
