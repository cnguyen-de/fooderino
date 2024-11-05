<script setup lang="ts">
import { useSupabaseUser } from '#imports';

const user = useSupabaseUser();
const usernameFallback = computed(() =>
  user.value.user_metadata?.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
);
console.log(user);
</script>

<template>
  <div class="flex h-full flex-row items-center justify-between border-t border-solid border-gray-500/50 p-2">
    <FooterLink link="/inventory">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="size-6">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M8.242 5.992h12m-12 6.003H20.24m-12 5.999h12M4.117 7.495v-3.75H2.99m1.125 3.75H2.99m1.125 0H5.24m-1.92 2.577a1.125 1.125 0 1 1 1.591 1.59l-1.83 1.83h2.16M2.99 15.745h1.125a1.125 1.125 0 0 1 0 2.25H3.74m0-.002h.375a1.125 1.125 0 0 1 0 2.25H2.99" />
      </svg>
    </FooterLink>
    <FooterLink link="/buy">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="size-6">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
      </svg>
    </FooterLink>
    <FooterLink link="/ai">🪄</FooterLink>
    <FooterLink link="/settings">
      <Avatar referrerpolicy="no-referrer">
        <AvatarImage :src="user?.user_metadata.picture" alt="Avatar" referrerpolicy="no-referrer" />
        <AvatarFallback>{{ usernameFallback }}</AvatarFallback>
      </Avatar>
    </FooterLink>
  </div>
</template>
