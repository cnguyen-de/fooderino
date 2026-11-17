<script setup lang="ts">
import { toast } from 'vue-sonner';
import type { HouseholdId } from '~~/types/pantry';
const household = useHousehold();
const { state, error } = household;
const name = ref('');
const token = ref('');
const scan = ref(false);
const importing = ref(false);
const busy = ref(false);
async function run(work: () => Promise<unknown>) {
  busy.value = true;
  try {
    await work();
  } catch (e) {
    toast.error(error.value ?? (e instanceof Error ? e.message : 'Please try again.'));
  } finally {
    busy.value = false;
  }
}
function pick(id: HouseholdId) {
  const from =
    state.value.kind === 'choosing' && importing.value
      ? state.value.candidates.filter((c) => c.household_id !== id).map((c) => c.household_id)
      : [];
  return run(() => household.pick(id, { import: from }));
}
function join() {
  let code = token.value.trim();
  try {
    code = new URL(code).searchParams.get('t') ?? code;
  } catch {}
  navigateTo({ path: '/join', query: { t: code } });
}
</script>
<template>
  <slot v-if="state.kind === 'member'" />
  <section v-else class="space-y-5 p-4">
    <template v-if="state.kind === 'loading'">
      <p role="status">Loading your household…</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <Button v-if="error" @click="household.refresh">Try again</Button>
    </template>
    <template v-else-if="state.kind === 'none'">
      <h1 class="text-2xl font-semibold">One home. One shared list.</h1>
      <p class="text-muted-foreground">Create your household or join the people you shop with.</p>
      <form class="space-y-3" @submit.prevent="run(() => household.create(name.trim()))">
        <label for="household-name">Household name</label
        ><Input id="household-name" v-model="name" required class="text-base" />
        <Button :disabled="busy || !name.trim()" type="submit">Create household</Button>
      </form>
      <hr />
      <form class="space-y-3" @submit.prevent="join">
        <label for="join-code">Share code or link</label><Input id="join-code" v-model="token" class="text-base" />
        <Button type="submit" variant="outline" :disabled="!token.trim()">Join household</Button>
        <Button type="button" variant="ghost" @click="scan = true">Scan QR code</Button>
      </form>
      <ScanJoinModal v-model:open="scan" />
    </template>
    <template v-else>
      <h1 class="text-2xl font-semibold">Pick your household</h1>
      <p>You will leave the other households. Their items stay there.</p>
      <label class="flex gap-3"><input v-model="importing" type="checkbox" /> Also import items from the others</label>
      <Button
        v-for="candidate in state.candidates"
        :key="candidate.household_id"
        class="w-full"
        :disabled="busy"
        @click="pick(candidate.household_id)"
        >{{ candidate.name }}</Button
      >
    </template>
  </section>
</template>
