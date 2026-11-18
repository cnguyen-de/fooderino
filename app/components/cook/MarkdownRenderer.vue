<script setup lang="ts">
import markdownit from 'markdown-it';
const md = markdownit();

defineProps<{ source: string }>();
</script>
<template>
  <div
    class="space-y-2 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
    v-html="md.render(source)"></div>
</template>
