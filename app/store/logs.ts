import { useListStore } from './list';

export const useLogStore = defineStore('logs', () => {
  const listStore = useListStore();
  const user = useSupabaseUser();
  const listId = computed(() => listStore.selectedList?.id ?? null);
  const { logs, append } = useLogs(listId);

  /**
   * The list id and actor come from context now, so callers pass only what
   * they know about the change itself.
   */
  const insertLog = async (itemName: string, action: string, payload: string) => {
    if (!listId.value) return;
    await append(listId.value, user.value?.email ?? null, itemName, action, payload);
  };

  return { logs, insertLog };
});
