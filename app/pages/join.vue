<script setup lang="ts">
import { toast } from 'vue-sonner';
import { clearPendingJoin, savePendingJoin } from '~~/utils/pending-join';

const route = useRoute();
const user = useSupabaseUser();
useSyncBootstrap();
const household = useHousehold();

const phase = ref<'ready' | 'joining' | 'done' | 'failed'>('ready');
const bring = ref(true);
const message = ref('');
const summary = ref<{ merged: number; copied: number } | null>(null);

const token = computed(() => (typeof route.query.t === 'string' ? route.query.t : ''));
const current = computed(() => household.state.value);
const hasItems = computed(() => current.value.kind === 'member');

/** Statuses where the server ruled the code out for good, so keeping it would only fail again. */
const FINAL = new Set([404, 410]);

async function join(): Promise<void> {
  if (!token.value) {
    phase.value = 'failed';
    message.value = 'That link is missing its share code.';
    return;
  }
  phase.value = 'joining';
  try {
    // Joining is valid before status loads. Keep the bring default so a failed
    // status lookup cannot silently leave an existing household's items behind.
    const result = await household.join(token.value, { bring: bring.value });
    clearPendingJoin(token.value);
    summary.value = { merged: result.merged, copied: result.copied };
    phase.value = 'done';
    toast('Joined the household');
  } catch (e: any) {
    if (FINAL.has(e?.statusCode ?? e?.status)) clearPendingJoin(token.value);
    phase.value = 'failed';
    message.value = household.error.value ?? e?.message ?? 'Could not join that household.';
  }
}

function signIn(): void {
  if (token.value) savePendingJoin(token.value);
  navigateTo('/login');
}
</script>

<template>
  <div class="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
    <template v-if="!user">
      <p>Sign in to join this household.</p>
      <Button @click="signIn">Sign in</Button>
    </template>

    <template v-else-if="phase === 'ready'">
      <p class="text-lg font-medium">Join this household?</p>
      <p v-if="current.kind === 'member'" class="text-sm text-gray-600 dark:text-gray-400">
        You will leave {{ current.household.name }}.
      </p>
      <label v-if="hasItems" class="flex items-center gap-3 text-sm">
        <Switch :checked="bring" @update:checked="bring = $event" />
        Bring my items along. Items with the same name are merged.
      </label>
      <Button @click="join">Join</Button>
    </template>

    <LoadingSpinner v-else-if="phase === 'joining'" message="Joining household..." />

    <template v-else-if="phase === 'done'">
      <p class="text-lg font-medium">You've joined the household.</p>
      <p v-if="summary && summary.merged + summary.copied > 0" class="text-sm">
        {{ summary.copied }} item(s) came along and {{ summary.merged }} merged into ones already there.
      </p>
      <NuxtLink to="/home"><Button>Open it</Button></NuxtLink>
    </template>

    <template v-else-if="phase === 'failed'">
      <p class="text-red-500">{{ message }}</p>
      <Button variant="outline" @click="phase = 'ready'">Try again</Button>
      <NuxtLink to="/home"><Button variant="ghost">Go back</Button></NuxtLink>
    </template>
  </div>
</template>
