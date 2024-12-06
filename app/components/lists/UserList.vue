<script setup lang="ts">
interface Props {
  avatar: string;
  name?: string;
  email: string;
  admin?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits(['removeUser']);
const shortName = computed(
  () =>
    props.name
      ?.split(' ')
      .map((n) => n[0])
      .join('.') ?? props.email[0]
);

const removeUser = (email: string) => {
  emit('removeUser', email);
};
</script>

<template>
  <Popover>
    <PopoverTrigger class="size-8">
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
          <p v-if="admin" class="text-white">Admin</p>
          <button class="self-start text-red-500" v-if="!admin" @click="removeUser(email)">Remove</button>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
