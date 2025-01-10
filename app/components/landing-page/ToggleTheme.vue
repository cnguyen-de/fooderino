<script setup lang="ts">
import { useColorMode, useMediaQuery } from '@vueuse/core';
import { useStorage } from '@vueuse/core';
import { Moon, Sun } from 'lucide-vue-next';

const isPreferredDark = useMediaQuery('(prefers-color-scheme: dark)');
const userColor = useStorage('userColor', `${isPreferredDark} ? 'dark' : 'light'`);
const mode = useColorMode();
const toggleTheme = () => {
  mode.value = mode.value === 'dark' ? 'light' : 'dark';
  userColor.value = mode.value;
};
</script>

<template>
  <Button @click="toggleTheme" size="sm" variant="ghost" class="w-full justify-start hover:bg-gray-500/20">
    <div v-if="mode == 'dark'" class="flex gap-2">
      <Moon class="size-5" />
    </div>

    <div v-else="mode == 'light'" class="flex gap-2">
      <Sun class="size-5" />
    </div>

    <span class="sr-only">Toggle theme</span>
  </Button>
</template>
