import type { Settings } from '../../types/Settings';
interface State {
  settings: Settings;
}
export const useSettingsStore = defineStore('settings', () => {
  const state = reactive<State>({
    settings: null
  });

  const fetchSettings = async () => {
    const { data } = await useFetch('/api/settings');
    if (data.value.settings?.length > 0) {
      state.settings = data.value.settings[0];
    }
  };

  return {
    ...toRefs(state),
    fetchSettings
  };
});
