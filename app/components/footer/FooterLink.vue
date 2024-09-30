<script setup lang="ts">
  defineProps<{ link: string }>();
  const router = useRouter();
  const currentRoute = ref();
  watch(() => router.currentRoute.value, () => {
    currentRoute.value = router.currentRoute.value.path;
  });
</script>

<template>
  <div class="p-1 w-full flex items-center justify-center rounded-md" :class="{'bg-gray-800/50': currentRoute === link }">
    <NuxtLink class="text-gray-300 font-bold h-full" :to="link"><slot></slot></NuxtLink>
  </div>
</template>
