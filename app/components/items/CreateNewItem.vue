<script setup lang="ts">
import { useForm, useField } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';

import { useItemStore } from '~/store/item';
const itemStore = useItemStore();
const props = defineProps<{
  location?: string;
  store?: string;
}>();

const formSchema = toTypedSchema(
  z.object({
    name: z.string().min(2).max(50),
    amountType: z.string().min(2).max(50).default('count'),
    amount: z
      .string()
      .min(1)
      .max(50)
      .default(props.location ? '1' : '0'),
    amountToPurchase: z
      .string()
      .min(1)
      .max(50)
      .default(props.store ? '1' : '0'),
    defaultAmount: z.string().min(1).max(50).default('0'),
    store: z
      .string()
      .min(1)
      .max(50)
      .default(props.store ?? ''),
    location: z
      .string()
      .min(1)
      .max(50)
      .default(props.location ?? '')
  })
);
let form = useForm({
  validationSchema: formSchema
});
const isDrawerOpen = ref(false);
watch(isDrawerOpen, (value) => {
  if (!value) {
    form = useForm({
      validationSchema: formSchema
    });
  }
});
const { value: location } = useField('location') as { value: string };
const { value: store } = useField('store') as { value: string };
const showAmount = computed(() => {
  return props.location !== undefined;
});
const isOpen = ref(false);
const onSubmit = form.handleSubmit(async (values) => {
  await itemStore.insertItem(values);
  isDrawerOpen.value = false;
});

const showCats = ref(false);
const showStores = ref(false);
const setLocation = (category: string) => {
  form.setFieldValue('location', category, true);
  showCats.value = false;
};
const setStore = (store: string) => {
  form.setFieldValue('store', store, true);
  showStores.value = false;
};
</script>

<template>
  <Drawer class="" v-model:open="isDrawerOpen">
    <DrawerTrigger class="flex flex-row items-center">
      <slot></slot>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="size-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    </DrawerTrigger>
    <DrawerContent class="mx-auto max-w-xl">
      <DrawerHeader>
        <DrawerTitle>Add new item</DrawerTitle>
        <DrawerDescription></DrawerDescription>
      </DrawerHeader>
      <form class="space-y-2 p-4" @submit="onSubmit">
        <FormField v-slot="{ componentField }" name="name">
          <FormItem class="relative grid grid-cols-[64px_1fr] place-items-center gap-2">
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input type="text" placeholder="Name" v-bind="componentField" />
            </FormControl>
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="location">
          <FormItem class="relative grid grid-cols-[64px_1fr] place-items-center gap-2">
            <FormLabel>Category </FormLabel>
            <FormControl>
              <Input type="text" placeholder="Fridge / Cupboard" v-model="location" @focus="showCats = true" />
            </FormControl>
            <div
              v-if="showCats"
              class="absolute right-0 top-10 z-10 w-[calc(100%_-_72px)] rounded-b border border-t-0 bg-gray-900 p-2 text-gray-200">
              <div class="flex max-h-20 flex-col gap-1 overflow-auto">
                <div
                  class="inline-block hover:bg-gray-500"
                  v-for="category of itemStore.inventoryCategories.filter((cat) =>
                    cat.toLowerCase().includes(location.toLowerCase())
                  )"
                  @click="setLocation(category)">
                  {{ category }}
                </div>
              </div>
            </div>
          </FormItem>
        </FormField>

        <FormField v-if="showAmount" v-slot="{ componentField }" name="amount">
          <FormItem class="relative grid grid-cols-[64px_1fr] place-items-center gap-2">
            <FormLabel>Amount</FormLabel>
            <FormControl>
              <Input type="text" placeholder="Amount of item you have" v-bind="componentField" />
            </FormControl>
          </FormItem>
        </FormField>
        <FormField v-else v-slot="{ componentField }" name="amountToPurchase">
          <FormItem class="relative grid grid-cols-[64px_1fr] place-items-center gap-2">
            <FormLabel>Purchase Amount</FormLabel>
            <FormControl>
              <Input type="text" placeholder="Amount to purchase" v-bind="componentField" />
            </FormControl>
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="store">
          <FormItem class="relative grid grid-cols-[64px_1fr] place-items-center gap-2">
            <FormLabel>Store</FormLabel>
            <FormControl>
              <Input type="text" placeholder="Where to buy item" v-model="store" @focus="showStores = true" />
            </FormControl>
            <div
              v-if="showStores"
              class="absolute top-9 w-full rounded-b border border-t-0 bg-background p-2 text-gray-200">
              <div class="flex max-h-20 flex-col overflow-auto">
                <div
                  class="inline-block hover:bg-gray-500"
                  v-for="category of itemStore.buyCategories.filter((cat) =>
                    cat.toLowerCase().includes(store.toLowerCase())
                  )"
                  @click="setStore(category)">
                  {{ category }}
                </div>
              </div>
            </div>
          </FormItem>
        </FormField>

        <Collapsible v-model:open="isOpen" class="mt-4">
          <CollapsibleTrigger class="flex flex-row items-center gap-1">
            See more options
            <span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="size-4">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="m4.5 5.25 7.5 7.5 7.5-7.5m-15 6 7.5 7.5 7.5-7.5" />
              </svg>
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div class="flex flex-col gap-2">
              <FormField v-if="showAmount" v-slot="{ componentField }" name="amountToPurchase">
                <FormItem class="relative grid grid-cols-[64px_1fr] place-items-center gap-2">
                  <FormLabel>Purchase Amount</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="Amount to purchase" v-bind="componentField" />
                  </FormControl>
                </FormItem>
              </FormField>
              <FormField v-else v-slot="{ componentField }" name="amount">
                <FormItem class="relative grid grid-cols-[64px_1fr] place-items-center gap-2">
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="Amount of item you have" v-bind="componentField" />
                  </FormControl>
                </FormItem>
              </FormField>

              <FormField v-slot="{ componentField }" name="defaultAmount">
                <FormItem class="relative mb-4 grid grid-cols-[64px_1fr] place-items-center gap-2">
                  <FormLabel>Default Amount</FormLabel>
                  <FormDescription class="absolute top-10">
                    Automatically add to purchase list after the amount is lower than
                  </FormDescription>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="Amount of items should always be in Inventory"
                      v-bind="componentField" />
                  </FormControl>
                </FormItem>
              </FormField>

              <FormField v-slot="{ componentField }" name="amountType">
                <FormItem class="relative grid grid-cols-[64px_1fr] place-items-center gap-2">
                  <FormLabel>Amount Type</FormLabel>

                  <Select v-bind="componentField">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Amount Type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="gram">gram</SelectItem>
                        <SelectItem value="count">count</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FormItem>
              </FormField>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </form>
      <DrawerFooter>
        <div class="flex flex-row justify-between">
          <DrawerClose>
            <Button variant="ghost" class="text-red-500">Cancel</Button>
          </DrawerClose>
          <DrawerClose>
            <Button class="max-w-min" type="submit" @click.prevent="onSubmit">Submit</Button>
          </DrawerClose>
        </div>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
</template>
