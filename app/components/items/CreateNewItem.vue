<script setup lang="ts">
import { useItemStore } from '~/store/item';
const itemStore = useItemStore();
const props = defineProps<{
  location?: string;
  store?: string;
}>();

const form = ref({
  name: '',
  amountType: 'count',
  amount: props.location ? '1' : '0',
  amountToPurchase: props.store ? '1' : '0',
  defaultAmount: '0',
  store: props.store ?? '',
  location: props.location ?? ''
});

const isDrawerOpen = ref(false);
watch(isDrawerOpen, (value) => {
  if (value) {
    form.value.name = '';
    form.value.amount = props.location ? '1' : '0';
    form.value.amountToPurchase = props.store ? '1' : '0';
    form.value.defaultAmount = '0';
    form.value.store = props.store ?? '';
    form.value.location = props.location ?? '';
  }
});
const showAmount = computed(() => {
  return typeof props.location !== 'undefined';
});
const isOpen = ref(false);
const onSubmit = async () => {
  await itemStore.insertItem(form.value);
  isDrawerOpen.value = false;
};

const showCats = ref(false);
const showStores = ref(false);
const showNames = ref(false);
const setLocation = (category: string) => {
  form.value.location = category;
  showCats.value = false;
};
const setStore = (store: string) => {
  form.value.store = store;
  showStores.value = false;
};
const setName = (n: string) => {
  form.value.name = n;
  showNames.value = false;
  const existingItem = itemStore.allItems.find((item) => item.name === n);
  form.value.amount = existingItem?.amount ?? '0';
  form.value.defaultAmount = existingItem?.defaultAmount ?? '0';
  form.value.amountType = existingItem?.amountType ?? 'count';
  form.value.store = existingItem?.store ?? '';
  form.value.location = existingItem?.location ?? '';
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
        <DrawerTitle>Add item</DrawerTitle>
        <DrawerDescription></DrawerDescription>
      </DrawerHeader>
      <form class="space-y-2 p-4" @submit="onSubmit">
        <FormField name="name">
          <FormItem class="relative grid grid-cols-[64px_1fr] place-items-center gap-2">
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input
                type="text"
                placeholder="Item Name"
                :modelValue="form.name"
                @update:modelValue="($event) => (form.name = $event)"
                @focus="showNames = true" />
            </FormControl>
            <div
              v-if="
                showNames &&
                itemStore.allItemNames.length > 0 &&
                itemStore.allItemNames.some((n) => n?.toLowerCase().includes(form.name?.toLowerCase()))
              "
              class="absolute right-0 top-10 z-10 w-[calc(100%_-_72px)] rounded-b border border-t-0 bg-gray-900 p-2 text-gray-200">
              <div class="flex max-h-20 flex-col gap-1 overflow-auto">
                <div
                  class="inline-block hover:bg-gray-500"
                  v-for="name of itemStore.allItemNames
                    .filter((n) => n?.toLowerCase().includes(form.name?.toLowerCase()))
                    .slice(0, 10)"
                  @click="setName(name)">
                  {{ name }}
                </div>
              </div>
            </div>
          </FormItem>
        </FormField>

        <FormField name="location">
          <FormItem class="relative grid grid-cols-[64px_1fr] place-items-center gap-2">
            <FormLabel>Category</FormLabel>
            <FormControl>
              <Input
                type="text"
                placeholder="Fridge / Cupboard"
                :modelValue="form.location"
                @update:modelValue="($event) => (form.location = $event)"
                @focus="showCats = true" />
            </FormControl>
            <div
              v-if="
                showCats &&
                itemStore.allCategories.length > 0 &&
                itemStore.allCategories.some((c) => c?.toLowerCase().includes(form.location?.toLowerCase()))
              "
              class="absolute right-0 top-10 z-10 w-[calc(100%_-_72px)] rounded-b border border-t-0 bg-gray-900 p-2 text-gray-200">
              <div class="flex max-h-20 flex-col gap-1 overflow-auto">
                <div
                  class="inline-block hover:bg-gray-500"
                  v-for="category of itemStore.allCategories
                    .filter((cat) => cat?.toLowerCase().includes(form.location?.toLowerCase()))
                    .slice(0, 10)"
                  @click="setLocation(category)">
                  {{ category }}
                </div>
              </div>
            </div>
          </FormItem>
        </FormField>

        <FormField v-if="showAmount" name="amount">
          <FormItem class="relative grid grid-cols-[64px_1fr] place-items-center gap-2">
            <FormLabel>Amount</FormLabel>
            <FormControl>
              <Input
                type="text"
                placeholder="Amount of item you have"
                :modelValue="form.amount"
                @update:modelValue="($event) => (form.amount = $event)" />
            </FormControl>
          </FormItem>
        </FormField>
        <FormField v-else name="amountToPurchase">
          <FormItem class="relative grid grid-cols-[64px_1fr] place-items-center gap-2">
            <FormLabel>Purchase Amount</FormLabel>
            <FormControl>
              <Input
                type="text"
                placeholder="Amount to purchase"
                :modelValue="form.amountToPurchase"
                @update:modelValue="($event) => (form.amountToPurchase = $event)" />
            </FormControl>
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="store">
          <FormItem class="relative grid grid-cols-[64px_1fr] place-items-center gap-2">
            <FormLabel>Store</FormLabel>
            <FormControl>
              <Input
                type="text"
                placeholder="Where to buy item"
                :modelValue="form.store"
                @update:modelValue="($event) => (form.store = $event)"
                @focus="showStores = true" />
            </FormControl>
            <div
              v-if="
                showStores &&
                itemStore.buyCategories.length > 0 &&
                itemStore.buyCategories.some((c) => c?.toLowerCase().includes(form.store?.toLowerCase()))
              "
              class="absolute right-0 top-10 z-10 w-[calc(100%_-_72px)] rounded-b border border-t-0 bg-gray-900 p-2 text-gray-200">
              <div class="flex max-h-20 flex-col gap-1 overflow-auto">
                <div
                  class="inline-block hover:bg-gray-500"
                  v-for="category of itemStore.buyCategories.filter((cat) =>
                    cat?.toLowerCase().includes(form.store?.toLowerCase())
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
                    <Input
                      type="text"
                      placeholder="Amount to purchase"
                      :modelValue="form.amountToPurchase"
                      @update:modelValue="($event) => (form.amountToPurchase = $event)" />
                  </FormControl>
                </FormItem>
              </FormField>
              <FormField v-else v-slot="{ componentField }" name="amount">
                <FormItem class="relative grid grid-cols-[64px_1fr] place-items-center gap-2">
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="Amount of item you have"
                      :modelValue="form.amount"
                      @update:modelValue="($event) => (form.amount = $event)" />
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
                      :modelValue="form.defaultAmount"
                      @update:modelValue="($event) => (form.defaultAmount = $event)" />
                  </FormControl>
                </FormItem>
              </FormField>

              <FormField v-slot="{ componentField }" name="amountType">
                <FormItem class="relative grid grid-cols-[64px_1fr] place-items-center gap-2">
                  <FormLabel>Amount Type</FormLabel>

                  <Select :modelValue="form.amountType" @update:modelValue="($event) => (form.amountType = $event)">
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
