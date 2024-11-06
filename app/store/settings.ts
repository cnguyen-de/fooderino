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
    state.settings = data.value.settings;
  };

  return {
    ...toRefs(state),
    fetchSettings
  };
});
