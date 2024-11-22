<script setup lang="ts"></script>

<template>
  <div class="flex flex-row justify-center gap-4">
    <NuxtLink to="/recipe">
      <div class="flex flex-row gap-2 px-4 py-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="size-6">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
        <span> Your Recipes </span>
      </div>
    </NuxtLink>
    <NuxtLink to="/recipe/ai">
      <div class="flex flex-row gap-2 px-4 py-2">
        <span>🪄 Generate new recipe</span>
      </div>
    </NuxtLink>
  </div>
  <div
    class="relative mx-auto flex h-[calc(100%_-_6.5rem)] w-full flex-col items-start justify-start gap-4 overflow-y-scroll p-4 text-white">
    <slot />
  </div>
</template>

<style scoped></style>
