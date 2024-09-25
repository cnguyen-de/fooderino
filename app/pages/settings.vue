<template>
  <button
    class="mt-3 text-white"
    @click="supabase.auth.signOut()">
    Log out
  </button>
</template>