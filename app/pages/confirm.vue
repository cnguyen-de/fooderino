<script setup lang="ts">
import { peekPendingJoin } from '~~/utils/pending-join';

const user = useSupabaseUser();

watch(
  user,
  () => {
    if (!user.value) return;
    // Signing in from a scanned share link: finish joining before anything else.
    const token = peekPendingJoin();
    return navigateTo(token ? { path: '/join', query: { t: token } } : '/home');
  },
  { immediate: true }
);
</script>

<template>
  <NuxtLayout name="app">
    <div>
      <p>Redirecting...</p>
    </div>
  </NuxtLayout>
</template>
