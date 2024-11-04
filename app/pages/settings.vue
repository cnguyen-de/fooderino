<script setup lang="ts">
const supabase = useSupabaseClient();
const logout = () => {
  supabase.auth.signOut();
  window.reload();
};
</script>
<template>
  <div class="flex flex-col items-center justify-center">
    <Button variant="destructive" class="mt-3" @click="logout()">Log out</Button>
  </div>
</template>
