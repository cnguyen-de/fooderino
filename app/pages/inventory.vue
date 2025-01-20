<script setup>
import { useItemStore } from '~/store/item';
import { ChevronRight, Pencil } from 'lucide-vue-next';
import { useStorage } from '@vueuse/core';
import { useListStore } from '~/store/list';

const itemStore = useItemStore();
const listStore = useListStore();
const { getFilteredInventoryItems } = toRefs(itemStore);
itemStore.fetchItems();
const categories = computed(() => itemStore.inventoryCategories);
// const items = computed(() => {
//   let items = itemStore.getFilteredInventoryItems;
//   if (!settingStore.settings?.show_empty_items) {
//     items = items.filter((item) => item.amount > 0);
//   }
//   return items;
// });
const isEditCategoryOpen = ref(false);
const selectedCategory = ref('');
const selectedOldCategory = ref('');
const openEditCategoryDrawer = (category) => {
  isEditCategoryOpen.value = true;
  selectedCategory.value = category;
  selectedOldCategory.value = category;
};
const editCategory = async () => {
  await itemStore.renameCategory(selectedOldCategory.value, selectedCategory.value);
  isEditCategoryOpen.value = false;
};
const categoryOpenMap = useStorage('categoryOpenMap', {});

const updateCategoryMap = (category, isOpen) => {
  categoryOpenMap.value[category] = isOpen;
  localStorage.setItem('categoryOpenMap', categoryOpenMap.toString());
};
</script>
<template>
  <NuxtLayout name="app">
    <NuxtLayout name="list">
      <div
        class="h-[calc(100%_-_7rem)] w-full overflow-auto"
        :class="{ '!h-[calc(100%_-_17rem)]': !listStore.selectedList }">
        <div v-for="category in categories" :key="category">
          <Collapsible :open="categoryOpenMap[category]" @update:open="updateCategoryMap(category, $event)">
            <div class="flex flex-row pr-4">
              <CollapsibleTrigger class="group/collapsible flex flex-row py-2">
                <h2 class="pl-4 text-lg font-bold">{{ category }}</h2>
                <ChevronRight
                  class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </CollapsibleTrigger>
              <button class="text-gray-700 dark:text-gray-300" @click.prevent="openEditCategoryDrawer(category)">
                <Pencil class="mx-2 size-4 opacity-80"></Pencil>
              </button>
              <span class="flex-grow"></span>
              <CreateNewItem :location="category"></CreateNewItem>
            </div>
            <CollapsibleContent>
              <InventoryList
                :items="
                  getFilteredInventoryItems
                    ?.filter((item) => item.location === category)
                    .sort((a, b) => a.id - b.id || a.name.localeCompare(b?.name))
                "></InventoryList>
            </CollapsibleContent>
          </Collapsible>
        </div>
        <div
          class="border-px m-4 flex flex-row items-center rounded-xl border border-dashed !border-gray-500/50 bg-gray-100/70 p-2 px-4 dark:bg-gray-700/20">
          <CreateNewItem class="w-full" location="New Category">Add item to a new category to the list</CreateNewItem>
        </div>
      </div>

      <!-- Edit category-->
      <Drawer v-model:open="isEditCategoryOpen" @onOpenChange="isEditCategoryOpen = $event">
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle> Rename category </DrawerTitle>
            <DrawerDescription> This action will affect all items under this category </DrawerDescription>
          </DrawerHeader>
          <div class="px-4">
            <Input class="" type="text" v-model="selectedCategory"></Input>
          </div>
          <DrawerFooter>
            <div class="flex flex-row justify-between">
              <DrawerClose>
                <Button class="text-red-500" variant="ghost">Close</Button>
              </DrawerClose>
              <DrawerClose>
                <Button type="submit" @click.prevent="editCategory">Rename</Button>
              </DrawerClose>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </NuxtLayout>
  </NuxtLayout>
</template>
