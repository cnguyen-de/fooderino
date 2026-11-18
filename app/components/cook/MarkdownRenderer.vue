<script setup lang="ts">
import markdownit from 'markdown-it';
const md = markdownit();

defineProps<{ source: string }>();
</script>
<template>
  <div v-html="md.render(source)"></div>
</template>
<style scoped>
div > * {
  list-style-type: disc;
}
</style>
