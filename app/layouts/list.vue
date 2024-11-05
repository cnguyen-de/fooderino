<script setup></script>
<template>
  <div class="h-full w-full">
    <ListSelector></ListSelector>
    <slot />
  </div>
  <div class="fixed bottom-16">
    <ActionBar></ActionBar>
  </div>
</template>
