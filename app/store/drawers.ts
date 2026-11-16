interface State {
  isInviteDrawerOpen: boolean;
  isShareListDrawerOpen: boolean;
  isRenameListDrawerOpen: boolean;
  isDeleteListDrawerOpen: boolean;
}
export const useDrawerStore = defineStore('drawers', () => {
  const state = reactive<State>({
    isInviteDrawerOpen: false,
    isShareListDrawerOpen: false,
    isRenameListDrawerOpen: false,
    isDeleteListDrawerOpen: false
  });

  return {
    ...toRefs(state)
  };
});
