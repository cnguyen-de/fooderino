<script setup lang="ts">
const props = withDefaults(defineProps<{ link: string; includeChild?: boolean }>(), {
  includeChild: false
});
const router = useRouter();
const currentRoute = ref();
watch(
  () => router.currentRoute.value,
  () => {
    currentRoute.value = router.currentRoute.value.path;
  },
  { immediate: true }
);
const isCurrentRoute = () => {
  if (props.includeChild) {
    return currentRoute.value.includes(props.link);
  }
  return currentRoute.value === props.link;
};
</script>

<template>
  <div
    class="flex h-full w-full items-center justify-center rounded-md"
    :class="{ 'bg-white dark:bg-gray-600/50': isCurrentRoute() }">
    <NuxtLink class="font-bold text-gray-700 dark:text-gray-300" :to="link"><slot></slot></NuxtLink>
  </div>
</template>
