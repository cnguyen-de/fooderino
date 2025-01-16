<script setup>
const user = useSupabaseUser();
const { auth } = useSupabaseClient();

const redirectTo = `${useRuntimeConfig().public.baseUrl}/confirm`;

watch(user?.value, () => {
  if (user.value) {
    navigateTo('/inventory');
  }
});
</script>

<template>
  <div class="flex min-h-full flex-col justify-center py-12 text-black dark:text-white sm:px-6 lg:px-8">
    <h2 class="my-6 px-4 text-center text-3xl font-extrabold">Sign in to your account with</h2>
    <button
      class="border-px mx-auto mt-3 max-w-min rounded-full border bg-gradient-to-r px-4 py-2 hover:from-red-600 hover:to-yellow-600 hover:text-white"
      @click="auth.signInWithOAuth({ provider: 'github', options: { redirectTo } })">
      Github
    </button>
    <button
      class="border-px mx-auto mt-3 max-w-min rounded-full border bg-gradient-to-r px-4 py-2 hover:from-red-600 hover:to-yellow-600 hover:text-white"
      @click="auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })">
      Google
    </button>
  </div>
</template>
