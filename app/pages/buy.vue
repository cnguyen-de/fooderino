<script setup>
import { useItemStore } from '~/store/item';
import { ChevronRight, Pencil } from 'lucide-vue-next';
import { useStorage } from '@vueuse/core';
import { useListStore } from '~/store/list';
const itemStore = useItemStore();
const listStore = useListStore();
itemStore.fetchItems();
const { showBuyItemsFromAllLists } = toRefs(itemStore);
const categories = computed(() => {
  let stores = itemStore?.buyItems?.map((item) => item.store.trim());
  if (showBuyItemsFromAllLists.value) {
    stores = itemStore?.buyItemsFromAllLists?.map((item) => item.store.trim());
  }
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

const isRenameStoreOpen = ref(false);
const selectedStore = ref('');
const selectedOldStore = ref('');
const openRenameStoreDrawer = (store) => {
  isRenameStoreOpen.value = true;
  selectedStore.value = store;
  selectedOldStore.value = store;
};
const renameStore = async () => {
  await itemStore.renameStore(selectedOldStore.value, selectedStore.value);
  isRenameStoreOpen.value = false;
};
</script>
<template>
  <NuxtLayout name="app">
    <NuxtLayout name="list">
      <div
        class="h-[calc(100%_-_7rem)] w-full overflow-auto"
        :class="{ '!h-[calc(100%_-_17rem)]': !listStore.selectedList }">
        <div v-for="category in categories" :key="category">
          <Collapsible
            :open="storeOpenMap[category] || itemStore.filterInput.length > 0"
            @update:open="updateStoreMap(category, $event)">
            <div class="flex flex-row pr-4">
              <CollapsibleTrigger class="group/collapsible flex flex-row py-2">
                <h2 class="pl-4 pr-2 text-lg font-bold">{{ category }}</h2>
                <ChevronRight
                  class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </CollapsibleTrigger>
              <button class="text-gray-700 dark:text-gray-300" @click.prevent="openRenameStoreDrawer(category)">
                <Pencil class="mx-2 size-4 opacity-80"></Pencil>
              </button>
              <span class="flex-grow"></span>
              <CreateNewItem :store="category"></CreateNewItem>
            </div>
            <CollapsibleContent>
              <BuyList
                :items="
                  shoppingItems
                    ?.filter((item) => item.store === category)
                    .sort((a, b) => b.last_updated - a.last_updated || a.name.localeCompare(b?.name))
                "
                @item-value-changed="itemStore.updateItem($event)"
                @add-item-to-inventory="itemStore.addItemToInventory($event)">
              </BuyList>
            </CollapsibleContent>
          </Collapsible>
        </div>
        <div
          v-if="listStore.selectedList"
          class="border-px m-4 flex flex-row items-center rounded-xl border border-dashed !border-gray-500/50 bg-gray-100/70 p-2 px-4 dark:bg-gray-700/20">
          <CreateNewItem class="w-full" store="New Store">Add item to a new store</CreateNewItem>
        </div>
      </div>

      <!-- Rename store category-->
      <Drawer v-model:open="isRenameStoreOpen" @onOpenChange="isRenameStoreOpen = $event">
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle> Rename store </DrawerTitle>
            <DrawerDescription> This action will affect all items in this store </DrawerDescription>
          </DrawerHeader>
          <div class="px-4">
            <Input class="" type="text" v-model="selectedStore"></Input>
          </div>
          <DrawerFooter>
            <div class="flex flex-row justify-between">
              <DrawerClose>
                <Button class="text-red-500" variant="ghost">Close</Button>
              </DrawerClose>
              <DrawerClose>
                <Button type="submit" @click.prevent="renameStore">Rename</Button>
              </DrawerClose>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </NuxtLayout>
  </NuxtLayout>
</template>
