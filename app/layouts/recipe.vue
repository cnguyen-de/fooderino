<script setup lang="ts"></script>

<template>
  <div class="flex flex-row justify-center gap-2 px-4 py-2">
    <FooterLink link="/recipe" alt-design>
      <div class="flex flex-row py-1">
        <span> Saved Recipes </span>
      </div>
    </FooterLink>
    <FooterLink link="/recipe/ai" alt-design>
      <div class="flex flex-row py-1">
        <span>🪄 GenAI Recipes</span>
      </div>
    </FooterLink>
  </div>
  <div
    class="relative mx-auto flex h-[calc(100%_-_7rem)] w-full flex-col items-start justify-start gap-4 overflow-y-scroll p-4">
    <slot />
  </div>
</template>

<style scoped></style>
