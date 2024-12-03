<script setup lang="ts">
import { useItemStore } from '~/store/item';
import type { Item } from '~~/types/Item';

const props = defineProps<{ item: Item; isBuyList: boolean }>();

const itemStore = useItemStore();
const isEditItemDrawerOpen = ref(false);
const showDeleteConfirmation = ref(false);
const newCategory = ref('');
const locationRef = ref(props.isBuyList ? props.item.store : props.item.location);
const onDeleteItem = async () => {
  await itemStore.deleteItem(props.item.id);
  isEditItemDrawerOpen.value = false;
};
const changeLocation = async () => {
  if (props.isBuyList) {
    await itemStore.updateItem({ ...props.item, store: newCategory.value });
  } else {
    await itemStore.updateItem({ ...props.item, location: newCategory.value });
  }
  isEditItemDrawerOpen.value = false;
};
</script>
<template>
  <Drawer v-model:open="isEditItemDrawerOpen" @onOpenChange="isEditItemDrawerOpen = $event">
    <DrawerTrigger class="pr-2 text-gray-400">
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
          d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
      </svg>
    </DrawerTrigger>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>Edit item {{ item.name }}</DrawerTitle>
      </DrawerHeader>
      <DrawerFooter>
        <div class="flex flex-row gap-2">
          <Input v-model="locationRef" readonly />
          <div class="flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="size-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 8.25 21 12m0 0-3.75 3.75M21 12H3" />
            </svg>
          </div>
          <Input v-model="newCategory" placeholder="New Value" />
          <Button @click="changeLocation()"
            ><svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="size-6">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </Button>
        </div>
        <Button
          variant="ghost"
          class="text-red-500"
          v-if="!showDeleteConfirmation"
          @click="showDeleteConfirmation = true">
          Delete
        </Button>
        <div v-else class="flex w-full flex-row justify-between">
          <Button variant="ghost" class="" @click="showDeleteConfirmation = false">No, do not delete</Button>
          <Button variant="outline" class="text-red-500" @click="onDeleteItem()">Yes, delete</Button>
        </div>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
</template>
