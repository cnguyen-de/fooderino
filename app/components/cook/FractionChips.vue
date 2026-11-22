<script setup lang="ts">
import { FRACTION_GLYPHS } from '~~/utils/pantry';
defineProps<{ label: string }>();
defineEmits<{ pick: [glyph: string] }>();
</script>
<template>
  <div role="group" :aria-label="label" class="flex gap-1">
    <Button
      v-for="glyph in FRACTION_GLYPHS"
      :key="glyph"
      type="button"
      variant="ghost"
      size="xs"
      class="min-w-8 bg-background text-sm tabular-nums text-muted-foreground hover:bg-primary/10 hover:text-primary"
      @click="$emit('pick', glyph)"
      >{{ glyph }}</Button
    >
  </div>
</template>
