export const useSettingsStore = defineStore('settings', () => {
  const { settings, update } = useUserSettings();

  const toggleEmptyItems = () => update({ show_empty_items: !(settings.value?.show_empty_items ?? true) });

  const toggleNoInventoryMode = (value?: boolean) =>
    update({ no_inventory: value ?? !(settings.value?.no_inventory ?? false) });

  return { settings, toggleEmptyItems, toggleNoInventoryMode };
});
