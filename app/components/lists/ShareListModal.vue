<script setup lang="ts">
import QRCode from 'qrcode';
import { toast } from 'vue-sonner';

const props = defineProps<{ open: boolean; listId: string | null }>();
const emit = defineEmits<{ 'update:open': [boolean] }>();

// Untyped: `types/database.types.ts` predates the v2 tables.
const supabase = useSupabaseClient() as any;
const { syncNow } = useSyncEngine();

const token = ref('');
const shareUrl = ref('');
const expiresAt = ref('');
const qrDataUrl = ref('');
const pending = ref(false);

function reset(): void {
  token.value = '';
  shareUrl.value = '';
  expiresAt.value = '';
  qrDataUrl.value = '';
}

watch(
  () => [props.open, props.listId] as const,
  async ([open, listId]) => {
    if (!open || !listId) return;
    reset();

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast('You need to be online to share a list');
      emit('update:open', false);
      return;
    }

    pending.value = true;
    try {
      // A list created offline exists only in Dexie until it is pushed, and
      // the token row carries a foreign key to it — push first.
      await syncNow();
      const res = await $fetch('/api/list/share', { method: 'POST', body: { listId } });
      token.value = res.token;
      shareUrl.value = res.url;
      expiresAt.value = res.expiresAt;
      qrDataUrl.value = await QRCode.toDataURL(res.url, { margin: 1, width: 240 });
    } catch {
      toast('Could not create a share code');
      emit('update:open', false);
    } finally {
      pending.value = false;
    }
  },
  { immediate: true }
);

const copy = async () => {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    toast('Link copied');
  } catch {
    toast('Could not copy the link');
  }
};

/** A plain client update: `list_share_tokens` has a member-scoped update policy. */
const revoke = async () => {
  if (!token.value) return;
  const { error } = await supabase
    .from('list_share_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token', token.value);

  if (error) {
    toast('Could not revoke that code');
    return;
  }
  toast('Code revoked');
  emit('update:open', false);
};
</script>

<template>
  <Drawer :open="open" @update:open="emit('update:open', $event)">
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>Share this list</DrawerTitle>
        <DrawerDescription>
          Have them scan this with their camera. Anyone with this code can join the list until it expires.
        </DrawerDescription>
      </DrawerHeader>

      <div class="flex flex-col items-center gap-3 px-4 pb-6">
        <LoadingSpinner v-if="pending" />
        <img v-else-if="qrDataUrl" :src="qrDataUrl" alt="Share QR code" class="rounded-lg bg-white" />
        <template v-if="shareUrl">
          <Input :model-value="shareUrl" readonly class="w-full" />
          <Button variant="outline" class="w-full" @click="copy">Copy link</Button>
          <Button variant="ghost" class="w-full text-red-500" @click="revoke">Revoke this code</Button>
        </template>
        <p v-if="expiresAt" class="text-xs text-gray-500">Expires {{ new Date(expiresAt).toLocaleString() }}</p>
      </div>
    </DrawerContent>
  </Drawer>
</template>
