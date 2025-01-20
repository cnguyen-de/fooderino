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
      'bg-gradient-to-r from-red-600/70 to-yellow-600/70 font-bold !text-orange-100':
        isCurrentRoute() && props.altDesign
    }"
    :to="link">
    <slot></slot>
  </NuxtLink>
</template>
