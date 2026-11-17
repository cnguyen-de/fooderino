<script setup>
const props = defineProps({
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },
  message: {
    type: String,
    default: 'Loading...'
  }
});

const sizeClasses = {
  sm: 'h-6 w-6 border-2',
  md: 'h-10 w-10 border-3',
  lg: 'h-16 w-16 border-4'
};
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 p-8">
    <div
      :class="[
        'animate-spin rounded-full border-gray-300 border-t-transparent dark:border-gray-600 dark:border-t-transparent',
        sizeClasses[size]
      ]"
      role="status"
      aria-label="Loading"></div>
    <p v-if="message" class="text-sm text-gray-600 dark:text-gray-400">{{ message }}</p>
  </div>
</template>
