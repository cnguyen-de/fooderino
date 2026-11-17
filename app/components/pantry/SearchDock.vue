<script setup lang="ts">
import { Plus, Search } from 'lucide-vue-next';
defineProps<{ modelValue: string; label: string; placeholder: string; adding?: boolean }>();
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>
<template>
  <div
    class="z-10 shrink-0 border-t bg-background/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
    <div class="relative rounded-xl bg-muted/70 transition-shadow focus-within:ring-2 focus-within:ring-primary/30">
      <component
        :is="adding ? Plus : Search"
        class="pointer-events-none absolute left-3 top-3 size-4 text-primary"
        aria-hidden="true" />
      <Input
        :model-value="modelValue"
        type="search"
        :aria-label="label"
        :placeholder="placeholder"
        class="h-10 rounded-xl border-0 bg-transparent pl-9 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        @update:model-value="$emit('update:modelValue', $event)" />
    </div>
  </div>
</template>
