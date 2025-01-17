interface State {
  isInviteDrawerOpen: boolean;
  isRenameListDrawerOpen: boolean;
  isDeleteListDrawerOpen: boolean;
}
export const useDrawerStore = defineStore('drawers', () => {
  const state = reactive<State>({
    isInviteDrawerOpen: false,
    isRenameListDrawerOpen: false,
    isDeleteListDrawerOpen: false
  });

  return {
    ...toRefs(state)
  };
});
