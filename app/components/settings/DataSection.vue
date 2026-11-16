<script setup lang="ts">
import { toast } from 'vue-sonner';
import { db } from '~~/utils/db';
import { downloadFile } from '~~/utils/download';
import { buildExportPayload, isValidPayload, planImport, type ExportPayload, type ImportPlan } from '~~/utils/export';
import { buildMember } from '~~/utils/list-ops';
import { queueSet } from '~~/utils/item-ops';
import { clearLocalData } from '~~/utils/account';

const user = useSupabaseUser();
const { status, syncNow } = useSyncEngine();

const fileInputRef = ref<HTMLInputElement | null>(null);
const isImportOpen = ref(false);
const isClearOpen = ref(false);
const busy = ref(false);
const pendingImport = ref<ExportPayload | null>(null);
const plan = ref<ImportPlan | null>(null);
const unsyncedOps = ref(0);

const LABELS: Record<string, string> = {
  lists: 'Lists',
  items: 'Items',
  recipes: 'Recipes'
};

async function exportJSON(): Promise<void> {
  const [lists, items, recipes] = await Promise.all([db.lists.toArray(), db.items.toArray(), db.recipes.toArray()]);
  const payload = buildExportPayload(lists, items, recipes);
  const today = new Date().toISOString().slice(0, 10);
  downloadFile(JSON.stringify(payload, null, 2), `fooderino-export-${today}.json`, 'application/json');
}

/** Syncs first so the "already here" check covers what is on the server too. */
async function syncedOrWarn(action: string): Promise<boolean> {
  if (!navigator.onLine) {
    toast(`${action} needs a connection`);
    return false;
  }
  await syncNow();
  if (status.value !== 'idle') {
    toast(`${action} needs a working sync — try again in a moment`);
    return false;
  }
  return true;
}

async function buildPlan(payload: ExportPayload): Promise<ImportPlan | null> {
  const userId = user.value?.id;
  if (!userId) return null;

  const [lists, items, recipes] = await Promise.all([
    db.lists.toArray(),
    db.items.toCollection().primaryKeys(),
    db.recipes.toCollection().primaryKeys()
  ]);

  return planImport(payload, {
    userId,
    now: new Date().toISOString(),
    existing: {
      lists: new Set(lists.map((l) => l.id)),
      items: new Set(items as string[]),
      recipes: new Set(recipes as string[])
    },
    liveListIds: new Set(lists.filter((l) => l.deleted_at === null).map((l) => l.id))
  });
}

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // allow re-selecting the same file after an error
  if (!file) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    toast('Import failed: that file is not valid JSON');
    return;
  }
  if (!isValidPayload(parsed)) {
    toast('Import failed: unrecognised format');
    return;
  }

  busy.value = true;
  try {
    if (!(await syncedOrWarn('Import'))) return;
    plan.value = await buildPlan(parsed);
    pendingImport.value = parsed;
    isImportOpen.value = !!plan.value;
  } finally {
    busy.value = false;
  }
}

async function confirmImport(): Promise<void> {
  isImportOpen.value = false;
  const payload = pendingImport.value;
  pendingImport.value = null;
  const me = user.value;
  if (!payload || !me) return;

  busy.value = true;
  try {
    // Re-planned rather than reusing the preview: a sync may have landed
    // while the summary was open.
    const p = await buildPlan(payload);
    if (!p) return;

    // An imported list arrives without its membership rows; give the
    // importer one so it shows in the members row like any list they made.
    const members = p.lists.map((l) =>
      buildMember(
        l.id,
        {
          id: me.id,
          email: me.email ?? '',
          name: me.user_metadata?.full_name ?? null,
          avatar: me.user_metadata?.picture ?? null
        },
        'admin'
      )
    );

    await db.transaction('rw', [db.lists, db.list_members, db.items, db.recipes], async () => {
      await db.lists.bulkAdd(p.lists);
      await db.list_members.bulkAdd(members);
      await db.items.bulkAdd(p.items);
      await db.recipes.bulkAdd(p.recipes);
    });

    // Rows go up before any counter op: an op's item, and that item's list,
    // must already exist server-side or the op is rejected on its foreign key.
    // queueSet pushes its op the moment it is queued.
    await syncNow();
    const byId = new Map(p.items.map((i) => [i.id, i]));
    for (const c of p.counters) {
      await queueSet(byId.get(c.item_id)!, c.field, c.value, me.email ?? null);
    }

    const added = p.summary.reduce((n, s) => n + s.newCount, 0);
    toast(`Import complete — ${added} record${added === 1 ? '' : 's'} added`);
  } catch (err) {
    toast(`Import failed: ${(err as Error).message}`);
  } finally {
    busy.value = false;
  }
}

async function openClear(): Promise<void> {
  // Flush first, so the warning only counts what genuinely cannot be saved.
  if (navigator.onLine) await syncNow();
  unsyncedOps.value = await db.pendingOps.count();
  isClearOpen.value = true;
}

async function confirmClear(): Promise<void> {
  isClearOpen.value = false;
  busy.value = true;
  try {
    await clearLocalData();
    await syncNow();
    toast('Local data cleared and re-synced');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="space-y-2">
    <Button variant="outline" class="w-full justify-start" :disabled="busy" @click="exportJSON">Export JSON</Button>
    <Button variant="outline" class="w-full justify-start" :disabled="busy" @click="fileInputRef?.click()">
      Import JSON
    </Button>
    <Button variant="outline" class="w-full justify-start text-red-500" :disabled="busy" @click="openClear">
      Clear local data
    </Button>
    <input ref="fileInputRef" type="file" accept=".json,application/json" class="hidden" @change="onFileSelected" />

    <Drawer v-model:open="isImportOpen">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Import summary</DrawerTitle>
          <DrawerDescription>
            Records already here are skipped, as are records that belong to another account.
          </DrawerDescription>
        </DrawerHeader>
        <div class="space-y-4 px-4 pb-6">
          <ul class="space-y-1 text-sm">
            <li v-for="row in plan?.summary ?? []" :key="row.label">
              <span class="font-medium">{{ LABELS[row.label] ?? row.label }}</span>: {{ row.newCount }} new,
              {{ row.skipCount }} skipped
            </li>
          </ul>
          <div class="flex gap-3">
            <Button class="flex-1" :disabled="!plan?.summary.some((s) => s.newCount > 0)" @click="confirmImport">
              Import
            </Button>
            <Button variant="outline" class="flex-1" @click="isImportOpen = false">Cancel</Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>

    <Drawer v-model:open="isClearOpen">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Clear local data?</DrawerTitle>
          <DrawerDescription>
            Everything on this device is removed and downloaded again from your account.
          </DrawerDescription>
        </DrawerHeader>
        <div class="space-y-4 px-4 pb-6">
          <p v-if="status !== 'idle' || unsyncedOps > 0" class="text-sm text-red-500">
            Some changes have not synced yet and will be lost. Export first if you need them.
          </p>
          <div class="flex gap-3">
            <Button class="flex-1 bg-red-600 text-white hover:bg-red-700" @click="confirmClear">Clear</Button>
            <Button variant="outline" class="flex-1" @click="isClearOpen = false">Cancel</Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  </div>
</template>
