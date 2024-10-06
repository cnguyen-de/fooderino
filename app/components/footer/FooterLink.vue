<script setup lang="ts">
defineProps<{ link: string }>();
const router = useRouter();
const currentRoute = ref();
watch(
  () => router.currentRoute.value,
  () => {
    currentRoute.value = router.currentRoute.value.path;
  }
);
</script>

<template>
  <div
    class="flex h-full w-full items-center justify-center rounded-md"
    :class="{ 'bg-gray-600/50': currentRoute === link }">
    <NuxtLink class="font-bold text-gray-300" :to="link"><slot></slot></NuxtLink>
  </div>
</template>
