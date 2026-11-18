<script setup lang="ts">
import QRCode from 'qrcode';
import { toast } from 'vue-sonner';
const household = useHousehold();
const { state } = household;
const qr = ref('');
const url = ref('');
const expires = ref('');
const busy = ref(false);
const leaving = ref(false);
async function share() {
  busy.value = true;
  try {
    const code = await household.share();
    url.value = code.url;
    expires.value = code.expiresAt;
    qr.value = await QRCode.toDataURL(code.url);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not share household.');
  } finally {
    busy.value = false;
  }
}
async function leave() {
  busy.value = true;
  try {
    await household.leave();
    await navigateTo('/home');
  } catch (e) {
    toast.error(household.error.value ?? (e instanceof Error ? e.message : 'Could not leave household.'));
  } finally {
    busy.value = false;
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(url.value);
    toast('Link copied');
  } catch {
    toast.error('Could not copy. Select the link below.');
  }
}
</script>
<template>
  <NuxtLayout name="app"
    ><section v-if="state.kind === 'member'" class="space-y-5 p-4">
      <h1 class="text-2xl font-semibold">{{ state.household.name }}</h1>
      <h2 class="font-medium">Members</h2>
      <ul class="space-y-3">
        <li v-for="member in state.members" :key="member.id">
          {{ member.name || member.email }} <span class="text-sm text-muted-foreground">{{ member.role }}</span>
        </li>
      </ul>
      <Button :disabled="busy" @click="share">Share household</Button>
      <div v-if="qr" class="space-y-3">
        <img :src="qr" alt="Scan to join household" class="mx-auto w-60" />
        <p>Anyone with this code can join until {{ new Date(expires).toLocaleString() }}.</p>
        <Input aria-label="Share link" :model-value="url" readonly /><Button variant="outline" @click="copy"
          >Copy link</Button
        >
      </div>
      <nav class="flex gap-6">
        <NuxtLink to="/cook/recipes" class="underline">Recipes</NuxtLink
        ><NuxtLink to="/settings" class="underline">Settings</NuxtLink>
      </nav>
      <Button variant="ghost" @click="leaving = !leaving">Leave household…</Button>
      <div v-if="leaving" class="space-y-3 rounded-xl border p-4">
        <p>Items stay with this household. You will start empty.</p>
        <Button variant="destructive" :disabled="busy" @click="leave">Leave household</Button
        ><Button variant="ghost" @click="leaving = false">Cancel</Button>
      </div>
    </section></NuxtLayout
  >
</template>
