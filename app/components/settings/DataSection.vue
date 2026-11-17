<script setup lang="ts">
import { toast } from 'vue-sonner';
import { downloadFile } from '~~/utils/download';
import {
  addImportedRecipes,
  exportDevice,
  importContext,
  parseImport,
  planImport,
  type ImportPayload,
  type ImportPlan
} from '~~/utils/export';
import { notifyLocalChange } from '~~/utils/sync-hook';
import { clearLocalData, countPendingChanges } from '~~/utils/account';

const user = useSupabaseUser();
const { status, flush, checkMembership } = useSyncEngine();
const { ops } = usePantry();
const household = useHousehold();

const fileInputRef = ref<HTMLInputElement | null>(null);
const isImportOpen = ref(false);
const isClearOpen = ref(false);
const busy = ref(false);
const pendingImport = ref<ImportPayload | null>(null);
const plan = ref<ImportPlan | null>(null);
const unsynced = ref(0);

const LABELS: Record<string, string> = {
  items: 'Items',
  recipes: 'Recipes'
};

async function exportJSON(): Promise<void> {
  const payload = await exportDevice();
  const today = new Date().toISOString().slice(0, 10);
  downloadFile(JSON.stringify(payload, null, 2), `fooderino-export-${today}.json`, 'application/json');
}

async function buildPlan(payload: ImportPayload): Promise<ImportPlan | null> {
  const userId = user.value?.id;
  return userId ? planImport(payload, await importContext(userId)) : null;
}

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // allow re-selecting the same file after an error
  if (!file) return;

  let parsed: ImportPayload | null;
  try {
    parsed = parseImport(JSON.parse(await file.text()));
  } catch {
    toast('Import failed: that file is not valid JSON');
    return;
  }
  if (!parsed) {
    toast('Import failed: unrecognised format');
    return;
  }
  if (household.state.value.kind !== 'member') {
    toast('Create or join a household before importing');
    return;
  }

  busy.value = true;
  try {
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
  if (!payload) return;

  busy.value = true;
  try {
    // Re-planned rather than reusing the preview: a sync may have landed
    // while the summary was open.
    const p = await buildPlan(payload);
    if (!p) return;

    // Each item becomes one create command carrying its counters, so the opening
    // stock lands atomically with the row.
    let created = 0;
    for (const draft of p.items) if (await ops.createItem({ ...draft, unit: 'count' })) created++;
    await addImportedRecipes(p.recipes);
    notifyLocalChange('recipes');

    const added = created + p.recipes.length;
    toast(`Import complete — ${added} record${added === 1 ? '' : 's'} added`);
  } catch (err) {
    toast(`Import failed: ${(err as Error).message}`);
  } finally {
    busy.value = false;
  }
}

async function openClear(): Promise<void> {
  // Flush first, so the warning only counts what genuinely cannot be saved.
  if (navigator.onLine) await flush();
  unsynced.value = await countPendingChanges();
  isClearOpen.value = true;
}

async function confirmClear(): Promise<void> {
  isClearOpen.value = false;
  busy.value = true;
  try {
    await clearLocalData();
    await checkMembership();
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
            Items whose name matches one already here are skipped, as are recipes already here or owned by another
            account.
          </DrawerDescription>
        </DrawerHeader>
        <div class="space-y-4 px-4 pb-6">
          <ul class="space-y-1 text-sm">
            <li v-for="row in plan?.summary ?? []" :key="row.label">
              <span class="font-medium">{{ LABELS[row.label] ?? row.label }}</span
              >: {{ row.newCount }} new, {{ row.skipCount }} skipped
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
          <p v-if="status !== 'idle' || unsynced > 0" class="text-sm text-red-500">
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
