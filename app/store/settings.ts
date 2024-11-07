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
    console.log(settings);
    const { data } = await client.from('users').update(settings).eq('uid', user.value?.id);
  };
  return {
    ...toRefs(state),
    fetchSettings,
    updateSettings
  };
});
