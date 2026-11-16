<script setup lang="ts">
import { toast } from 'vue-sonner';
import { useListStore } from '~/store/list';
import { savePendingJoin } from '~~/utils/pending-join';

const route = useRoute();
const user = useSupabaseUser();
const listStore = useListStore();
const { syncNow } = useSyncEngine();

const state = ref<'idle' | 'joining' | 'done' | 'failed'>('idle');
const message = ref('');
const listName = ref('');
const joinedListId = ref<string | null>(null);

const token = computed(() => (typeof route.query.t === 'string' ? route.query.t : ''));

async function join(): Promise<void> {
  if (!token.value) {
    state.value = 'failed';
    message.value = 'That link is missing its share code.';
    return;
  }

  state.value = 'joining';
  try {
    const res = await $fetch('/api/list/join', { method: 'POST', body: { token: token.value } });
    listName.value = res.listName;
    joinedListId.value = res.listId;
    // Pull the newly visible list and its items now if the engine is
    // already running; otherwise the app layout's first sync back-fills it.
    await syncNow();
    state.value = 'done';
    toast(`Joined ${res.listName}`);
  } catch (e: any) {
    state.value = 'failed';
    message.value = e?.data?.message ?? 'Could not join that list.';
  }
}

function signIn(): void {
  if (token.value) savePendingJoin(token.value);
  navigateTo('/login');
}

function openList(): void {
  // The list may still be arriving; the store falls back to the first list
  // until it does, then switches to it.
  if (joinedListId.value) listStore.selectedListId = joinedListId.value;
  navigateTo('/inventory');
}

watch(
  user,
  (u) => {
    if (u && state.value === 'idle') void join();
  },
  { immediate: true }
);
</script>

<template>
  <div class="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
    <template v-if="!user">
      <p>Sign in to join this list.</p>
      <Button @click="signIn">Sign in</Button>
    </template>

    <LoadingSpinner v-else-if="state === 'joining' || state === 'idle'" message="Joining list..." />

    <template v-else-if="state === 'done'">
      <p class="text-lg font-medium">You've joined {{ listName }}.</p>
      <Button @click="openList">Open it</Button>
    </template>

    <template v-else-if="state === 'failed'">
      <p class="text-red-500">{{ message }}</p>
      <NuxtLink to="/inventory"><Button variant="outline">Go back</Button></NuxtLink>
    </template>
  </div>
</template>
