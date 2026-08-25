import type { UserSettingsRecord } from '~~/types/sync';

export const useSettingsStore = defineStore('settings', () => {
  const { settings, update } = useUserSettings();
  const quota = ref<{ ai: boolean; free_ai_calls: number } | null>(null);

  /** Read-only cache. The client never writes these — /api/recipe does. */
  const fetchQuota = async () => {
    const data = await $fetch('/api/settings');
    quota.value = data?.quota ?? null;
    return quota.value;
  };

  const updateSettings = (patch: Partial<UserSettingsRecord>) => update(patch);

  const toggleEmptyItems = () => update({ show_empty_items: !(settings.value?.show_empty_items ?? true) });

  const toggleNoInventoryMode = (value?: boolean) =>
    update({ no_inventory: value ?? !(settings.value?.no_inventory ?? false) });

  const freeAICalls = computed(() => (quota.value?.ai ? 999 : (quota.value?.free_ai_calls ?? 0)));

  return { settings, quota, fetchQuota, updateSettings, toggleEmptyItems, toggleNoInventoryMode, freeAICalls };
});
