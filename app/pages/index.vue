<script setup lang="ts">
const user = useSupabaseUser();

watchEffect(() => {
  if (user.value) {
    navigateTo('/inventory');
  }
});
</script>

<template><div></div></template>
