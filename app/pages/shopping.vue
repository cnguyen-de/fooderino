<script setup>
import { useItemStore } from '~/store/item';
import { ChevronRight, Undo, Redo } from 'lucide-vue-next';
import { useStorage } from '@vueuse/core';
import { useListStore } from '~/store/list';
import { useActionStore } from '~/store/actions';
const itemStore = useItemStore();
const actionStore = useActionStore();
const listStore = useListStore();
itemStore.showBuyItemsFromAllLists = true;
itemStore.fetchItems();
const { showBuyItemsFromAllLists } = toRefs(itemStore);
const categories = computed(() => {
  let stores = itemStore?.buyItemsFromAllLists
    // ?.filter((item) => !actionStore.purchasedItems.some((i) => i.id === item.id))
    .map((item) => item.store.trim());
  return [...new Set(stores)].sort((a, b) => a.localeCompare(b));
});
const storeOpenMap = useStorage('storeOpenMap', {});

const updateStoreMap = (category, isOpen) => {
  storeOpenMap.value[category] = isOpen;
  localStorage.setItem('storeOpenMap', storeOpenMap.toString());
};

const shoppingItems = computed(() => {
  if (showBuyItemsFromAllLists.value) {
    return itemStore.getFilteredAllBuyItems;
  }
  return itemStore.getFilteredShoppingItems;
});

const onAddItemToInventory = (item) => {
  console.log('purchase item', item);
  const action = {
    type: 'purchase',
    payload: item
  };
  actionStore.addAction(action);
};

const onItemValueChanged = (item) => {
  itemStore.updateItem(item);
};
</script>
<template>
  <NuxtLayout name="app">
    <div class="flex flex-row items-center justify-between">
      <div class="w-20"></div>
      <h1 class="px-2 text-center text-2xl font-bold">Shopping List</h1>
      <div class="flex flex-row gap-2">
        <Button class="p-1 px-2" variant="ghost" :disabled="!actionStore.undoable" @click="actionStore.undo()">
          <Undo class="size-5"></Undo>
        </Button>
        <Button class="p-1 px-2" variant="ghost" :disabled="!actionStore.redoable" @click="actionStore.redo()">
          <Redo class="size-5"></Redo>
        </Button>
      </div>
    </div>
    <div class="h-[calc(100%_-_8rem)] w-full overflow-auto">
      <div v-for="category in categories" :key="category">
        <Collapsible :open="storeOpenMap[category]" @update:open="updateStoreMap(category, $event)">
          <div class="flex flex-row pr-4">
            <CollapsibleTrigger class="group/collapsible flex flex-row py-2">
              <h2 class="pl-4 pr-2 text-lg font-bold">{{ category }}</h2>
              <ChevronRight
                class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </CollapsibleTrigger>
            <span class="flex-grow"></span>
            <CreateNewItem :store="category"></CreateNewItem>
          </div>
          <CollapsibleContent>
            <BuyList
              :items="
                shoppingItems
                  ?.filter(
                    (item) => item.store === category && !actionStore.purchasedItems.some((i) => i.id === item.id)
                  )
                  .sort((a, b) => a.id - b.id || a.name.localeCompare(b?.name))
              "
              @item-value-changed="onItemValueChanged($event)"
              @add-item-to-inventory="onAddItemToInventory($event)">
              ></BuyList
            >
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
    <div class="fixed bottom-16 w-full rounded-t-2xl bg-black/30 p-4">
      <h3>Purchased</h3>
      <div v-for="item in actionStore.purchasedItems">
        {{ item.name }} {{ item.amount_to_purchase }} -> {{ item.location }}
      </div>
      <div class="">Confirm</div>
    </div>
  </NuxtLayout>
</template>
