<script setup lang="ts">
const props = withDefaults(defineProps<{ link: string; includeChild?: boolean; altDesign?: boolean }>(), {
  includeChild: false,
  altDesign: false
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
    return currentRoute.value?.includes(props.link);
  }
  return currentRoute.value === props.link;
};
</script>

<template>
  <NuxtLink
    class="flex h-full w-full items-center justify-center rounded-md text-gray-700 dark:text-gray-300"
    :class="{
      'bg-white dark:bg-gray-600/50': isCurrentRoute() && !props.altDesign,
      'rounded-none border-t-2 !border-red-500 font-bold !text-black dark:!text-white':
        isCurrentRoute() && props.altDesign,
      'rounded-none bg-white/80 !text-gray-500 dark:bg-gray-700/50': !isCurrentRoute() && props.altDesign
    }"
    :to="link">
    <slot></slot>
  </NuxtLink>
</template>
