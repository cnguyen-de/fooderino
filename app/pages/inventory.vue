<script setup>
import { useItemStore } from '~/store/item';
import { useSettingsStore } from '~/store/settings';
import { ChevronRight } from 'lucide-vue-next';

const itemStore = useItemStore();
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
</script>
<template>
  <NuxtLayout name="app">
    <NuxtLayout name="list">
      <div class="h-[calc(100%_-_7rem)] w-full overflow-auto">
        <div v-for="category in categories" :key="category">
          <Collapsible default-open>
            <div class="flex flex-row pr-4">
              <CollapsibleTrigger class="group/collapsible flex flex-row py-2">
                <h2 class="pl-4 font-bold text-white">{{ category }}</h2>
                <ChevronRight
                  class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </CollapsibleTrigger>
              <CreateNewItem :location="category"></CreateNewItem>
              <span class="flex-grow"></span>
              <button class="text-gray-300/50" @click.prevent="openEditCategoryDrawer(category)">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.5"
                  stroke="currentColor"
                  class="size-6">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                </svg>
              </button>
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

        <div v-if="categories?.length === 0" class="p-2">
          <CreateNewItem>Add an item to the list </CreateNewItem>
        </div>
      </div>

      <!-- Edit category-->
      <Drawer v-model:open="isEditCategoryOpen" @onOpenChange="isEditCategoryOpen = $event">
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle class="pb-4">Edit Category</DrawerTitle>
            <DrawerDescription>
              <Input type="text" v-model="selectedCategory"></Input>
            </DrawerDescription>
          </DrawerHeader>
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
