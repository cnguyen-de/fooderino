<script setup>
const supabase = useSupabaseClient()
</script>
<template>
  inventory

  <button
    class="mt-3"
    @click="supabase.auth.signOut()">
    Log out
  </button>
  </template>