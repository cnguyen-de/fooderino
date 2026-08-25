import { useSettingsStore } from '~/store/settings';

export const useNoInventoryMode = (): boolean => useSettingsStore().settings?.no_inventory ?? false;
