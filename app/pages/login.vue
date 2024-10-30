<script setup>
const user = useSupabaseUser();
const { auth } = useSupabaseClient();

const redirectTo = `${useRuntimeConfig().public.baseUrl}/confirm`;

onMounted(() => {
  console.log(useRuntimeConfig().public.baseUrl);
});
watchEffect(() => {
  if (user.value) {
    navigateTo('/inventory');
  }
});
</script>

<template>
  <div class="flex min-h-full flex-col justify-center py-12 text-white sm:px-6 lg:px-8">
    <h2 class="my-6 text-center text-3xl font-extrabold">Sign in to your account</h2>
    <button class="mt-3" @click="auth.signInWithOAuth({ provider: 'github', options: { redirectTo } })">
      Log in with github
    </button>
    <button class="mt-3" @click="auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })">
      Log in with Google
    </button>
  </div>
</template>
