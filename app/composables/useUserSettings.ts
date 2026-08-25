import { liveQuery } from 'dexie';
import { db } from '~~/utils/db';
import { notifyLocalChange } from '~~/utils/sync-hook';
import type { UserSettingsRecord } from '~~/types/sync';

// Module-level, matching useLists/useLogs: one live subscription shared by
// every component, so the row is already there when a page mounts.
const rows = ref<UserSettingsRecord[]>([]);
let started = false;

function ensureStarted(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  liveQuery(() => db.user_settings.filter((s) => s.deleted_at === null).toArray()).subscribe({
    next: (r) => {
      rows.value = r;
    },
    error: (e) => console.error('useUserSettings:', e)
  });
}

export function useUserSettings() {
  onBeforeMount(ensureStarted);
  const user = useSupabaseUser();

  const settings = computed<UserSettingsRecord | null>(
    () => rows.value.find((s) => s.user_id === user.value?.id) ?? null
  );

  /** Creates the row on first write, so a new account needs no seeding. */
  async function update(patch: Partial<UserSettingsRecord>): Promise<void> {
    const userId = user.value?.id;
    if (!userId) return;
    const now = new Date().toISOString();
    const existing = settings.value;

    if (existing) {
      await db.user_settings.update(existing.id, { ...patch, updated_at: now });
      notifyLocalChange('user_settings', existing.id);
      return;
    }

    const fresh: UserSettingsRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      servings: 1,
      allergies: '',
      cuisines: '',
      show_empty_items: true,
      no_inventory: false,
      updated_at: now,
      deleted_at: null,
      ...patch
    };
    await db.user_settings.add(fresh);
    notifyLocalChange('user_settings', fresh.id);
  }

  return { settings, update };
}
