<script setup lang="ts"></script>

<template>
  <div class="flex flex-row justify-center px-4">
    <FooterLink link="/recipe">
      <div class="flex flex-row py-2">
        <span> Saved Recipes </span>
      </div>
    </FooterLink>
    <FooterLink link="/recipe/ai">
      <div class="flex flex-row p-2">
        <span>🪄 GenAI Recipes</span>
      </div>
    </FooterLink>
  </div>
  <div
    class="relative mx-auto flex h-[calc(100%_-_6.5rem)] w-full flex-col items-start justify-start gap-4 overflow-y-scroll p-4 text-white">
    <slot />
  </div>
</template>

<style scoped></style>
