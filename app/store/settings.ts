import type { Settings } from '../../types/Settings';
interface State {
  settings: Settings | null;
}
export const useSettingsStore = defineStore('settings', () => {
  const client = useSupabaseClient();
  const user = useSupabaseUser();
  const state = reactive<State>({
    settings: null
  });

  const fetchSettings = async () => {
    const { data } = await useFetch('/api/settings');
    state.settings = data.value?.settings;
    return data.value;
  };

  const updateSettings = async (settings: Settings) => {
    const { data } = await client.from('users').update(settings).eq('id', user.value?.id);
    await fetchSettings();
  };

  const toggleEmptyItems = async () => {
    if (state.settings) {
      const newSettings = { ...state.settings, show_empty_items: !state.settings.show_empty_items };
      await updateSettings(newSettings);
    }
  };

  const toggleNoInventoryMode = async (value) => {
    if (state.settings) {
      const newSettings = { ...state.settings, no_inventory: value ? value : !state.settings.no_inventory };
      await updateSettings(newSettings);
    }
  };
  return {
    ...toRefs(state),
    fetchSettings,
    updateSettings,
    toggleEmptyItems,
    toggleNoInventoryMode
  };
});
