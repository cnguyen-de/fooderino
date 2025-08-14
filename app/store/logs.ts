import { useListStore } from './list';

export const useLogStore = defineStore('logs', () => {
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();
  const listStore = useListStore();
  const state = reactive({
    logs: []
  });

  const fetchLogs = async () => {
    if (!listStore.selectedList) {
      return;
    }
    const { data } = await supabase
      .from('logs')
      .select()
      .eq('list_id', listStore.selectedList?.id)
      .order('created_at', { ascending: false })
      .limit(30);
    state.logs = data;
  };

  const insertLog = async (list_id: string, user: string, item: string, action: string, payload: string) => {
    if (!listStore.selectedList) {
      return;
    }
    const { data } = await supabase.from('logs').insert({ list_id, user, item, action, payload });
    state.logs.unshift(data[0]);
  };

  return {
    ...toRefs(state),
    fetchLogs,
    insertLog
  };
});
