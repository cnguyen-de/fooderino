<script setup lang="ts">
const user = useSupabaseUser();

watch(user, () => {
  if (user.value) {
    return navigateTo('/inventory')
  }
}, { immediate: true })
</script>

<template>
  <NuxtLayout name="app">
    <div>
      <p>Redirecting...</p>
    </div>
  </NuxtLayout>
</template>
