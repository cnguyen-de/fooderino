import type { Command } from '~~/types/Command';
import type { ItemRecord } from '~~/types/sync';
import { useStorage } from '@vueuse/core';
import { useItemStore } from './item';

interface State {
  actions: Command[];
  currentActionIndex: number;
  purchasedItems: ItemRecord[];
}

export const useActionStore = defineStore('actions', () => {
  const state = reactive<State>({
    actions: [],
    currentActionIndex: -1,
    purchasedItems: []
  });
  const purchasedItems = useStorage<ItemRecord[]>('purchasedItem', []);
  // Baskets persisted before the Dexie cutover hold legacy rows with numeric
  // ids that no longer exist. Confirming one would queue an op against a
  // missing item, so they are dropped on load rather than carried forward.
  state.purchasedItems = purchasedItems.value.filter((item) => typeof item?.id === 'string');
  watch(
    () => state.purchasedItems,
    (value) => {
      purchasedItems.value = value;
    }
  );
  const redoable = computed(() => {
    return state.currentActionIndex < state.actions.length - 1;
  });

  const undoable = computed(() => {
    return state.actions.length > 0 && state.currentActionIndex > -1;
  });

  const addAction = (action: Command) => {
    if (state.currentActionIndex !== state.actions.length - 1) {
      state.actions.splice(state.currentActionIndex + 1, state.actions.length - state.currentActionIndex - 1);
      state.currentActionIndex = state.actions.length - 1;
    }
    state.actions.push(action);
    state.currentActionIndex++;
    switch (action.type) {
      case 'purchase':
        state.purchasedItems.push(action.payload);
        break;
    }
  };
  /**
   * Undo the last action
   * Current Index moves up 1 and last purchased item is removed (assuming last action is an purchase command).
   */
  const undo = () => {
    if (state.currentActionIndex === -1) {
      state.currentActionIndex = state.actions.length - 1;
    } else {
      state.currentActionIndex--;
    }
    state.purchasedItems.pop();
  };

  /**
   * Redo the last action
   * Re-add the item at the index position, assuming item was a purchase command and "redo" removed it from the purchasedItems array )
   * Current Index moves down 1.
   */
  const redo = () => {
    state.purchasedItems.push(state.actions[state.currentActionIndex + 1].payload);
    state.currentActionIndex++;
  };

  const clearPurchasedItems = () => {
    state.purchasedItems = [];
  };

  const removePurchasedItemById = (id: string) => {
    const index = state.purchasedItems.findIndex((item) => item.id === id);
    if (index > -1) {
      state.purchasedItems.splice(index, 1);
    }
  };

  const confirmPurchasing = async () => {
    const itemStore = useItemStore();
    // Sequential, over a copy: the previous `forEach(async …)` never awaited,
    // so it mutated the array it was iterating while the updates were in flight.
    for (const item of [...state.purchasedItems]) {
      await itemStore.addItemToInventory(item);
      removePurchasedItemById(item.id);
    }
    state.actions = [];
    state.currentActionIndex = -1;
  };

  const purchasedItemsCount = computed(() => {
    // Sum of all the amount_to_purchase values in the purchasedItems array
    return state.purchasedItems.reduce((acc, item) => acc + item.amount_to_purchase, 0);
  });

  return {
    ...toRefs(state),
    // Actions
    addAction,
    undo,
    redo,
    clearPurchasedItems,
    removePurchasedItemById,
    confirmPurchasing,
    // Getters
    redoable,
    undoable,
    purchasedItemsCount
  };
});
