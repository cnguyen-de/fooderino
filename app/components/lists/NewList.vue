<script setup lang="ts">
import { useListStore } from '~/store/list';
import { CookingPot, House, ShoppingBasket, ShoppingCart } from 'lucide-vue-next';
const listname = ref('');
const createNewList = async (listname: string) => {
  await useListStore().createList(listname);
};
</script>

<template>
  <Alert>
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
        d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
    </svg>
    <AlertTitle class="text-xl font-bold">Welcome</AlertTitle>
    <AlertDescription>
      <ul class="list-disc">
        <li>Start using Fooderino by creating a list</li>
        <li>Items can be added into a list and divided into categories (stores in shopping list)</li>
        <li>
          Items in inventory will show up in <House class="inline-block"></House>, while items to be purchased are shown
          in <ShoppingCart class="inline-block"></ShoppingCart>
        </li>
        <li>The app can be used as a check-list app so we recommend to use a list for groceries/food</li>
        <li>
          Use shopping mode <ShoppingBasket class="inline-block"></ShoppingBasket> when shopping to display all shopping
          items across multiple lists
        </li>
      </ul>
    </AlertDescription>
  </Alert>
  <div class="mt-4">
    <Label>List Name</Label>
    <Input class="" placeholder="Groceries" v-model="listname"></Input>
    <Button class="mt-4" @click="createNewList(listname)" :disabled="listname.length === 0">Create A List</Button>
  </div>
</template>
