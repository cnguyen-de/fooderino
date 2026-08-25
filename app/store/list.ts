import type { ListRecord } from '~~/types/sync';
import { useItemStore } from '~/store/item';

interface State {
  selectedListId: string | null;
}

export const useListStore = defineStore('list', () => {
  const state = reactive<State>({ selectedListId: null });
  const { lists, loading, create, rename, remove, removeMember, membersOf } = useLists();

  const selectedList = computed<ListRecord | null>(
    () => lists.value.find((l) => l.id === state.selectedListId) ?? lists.value[0] ?? null
  );

  const setSelectedList = (list: ListRecord | null) => {
    state.selectedListId = list?.id ?? null;
  };

  const selectedMembers = computed(() =>
    selectedList.value ? membersOf(selectedList.value.id).value : []
  );

  // TEMPORARY BRIDGE — delete in Task 14 (items cutover).
  // Lists now come from Dexie, but items still come from the legacy `items`
  // table via a fetch keyed on the selected list. The old `setSelectedList`
  // called `fetchItems()` inline; without something here, switching lists
  // between this task and Task 14 would leave the previous list's items on
  // screen, and a cold start would show none at all.
  watch(
    selectedList,
    (list) => {
      if (!import.meta.client) return;
      const itemStore = useItemStore();
      if (!list) {
        itemStore.inventoryItems = [];
        itemStore.buyItems = [];
        itemStore.allItems = [];
        itemStore.buyItemsFromAllLists = [];
        return;
      }
      void itemStore.fetchItems();
    },
    { immediate: true }
  );

  return {
    ...toRefs(state),
    lists,
    isLoading: loading,
    selectedList,
    selectedMembers,
    setSelectedList,
    createList: create,
    renameList: rename,
    deleteList: remove,
    removeUser: removeMember
  };
});
