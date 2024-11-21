<script setup lang="ts">
interface Props {
  avatar?: string;
  name?: string;
  email: string;
}

const props = defineProps<Props>();

const shortName = computed(
  () =>
    props.name
      ?.split(' ')
      .map((n) => n[0])
      .join('.') ?? props.email[0]
);
</script>

<template>
  <Popover>
    <PopoverTrigger>
      <Avatar class="size-8">
        <AvatarImage :src="avatar" alt="@radix-vue" />
        <AvatarFallback>{{ shortName }}</AvatarFallback>
      </Avatar>
    </PopoverTrigger>
    <PopoverContent>
      <div class="flex flex-row gap-2">
        <Avatar>
          <AvatarImage :src="avatar" alt="@radix-vue" />
          <AvatarFallback>{{ shortName }}</AvatarFallback>
        </Avatar>
        <div class="flex flex-col">
          <p v-if="name">{{ name }}</p>
          <p v-else>Pending Invite</p>
          <p class="text-sm font-thin">{{ email }}</p>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
