import { useSettingsStore } from '~/store/settings';

export const useNoInventoryMode = (): boolean => {
  const noInventory = computed(() => useSettingsStore().settings?.no_inventory);
  return noInventory.value || false;
};
