<script setup lang="ts">
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger
} from '@/components/ui/drawer';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { updateItems } from '~/composables/items';

const formSchema = toTypedSchema(
  z.object({
    name: z.string().min(2).max(50),
    amountType: z.string().min(2).max(50).default('count'),
    amount: z.string().min(1).max(50),
    store: z.string().min(2).max(50)
  })
);
const form = useForm({
  validationSchema: formSchema
});

const isDrawerOpen = ref(false);
const onSubmit = form.handleSubmit(async (values) => {
  console.log('Form submitted!', values);
  await updateItems(values);
  isDrawerOpen.value = false;
  await fetchInventoryItems();
});
</script>

<template>
  <Drawer class="" v-model:open="isDrawerOpen">
    <DrawerTrigger class="text-blue-200">+</DrawerTrigger>
    <DrawerContent class="mx-auto max-w-xl">
      <DrawerHeader>
        <DrawerTitle>Add new item</DrawerTitle>
        <DrawerDescription></DrawerDescription>
      </DrawerHeader>
      <form class="space-y-6 p-4" @submit="onSubmit">
        <FormField v-slot="{ componentField }" name="name">
          <FormItem>
            <FormControl>
              <Input type="text" placeholder="Name" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="amountType">
          <FormItem>
            <Select v-bind="componentField">
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Amount Type" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="gram">gram</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="count">count</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        </FormField>
        <FormField v-slot="{ componentField }" name="amount">
          <FormItem>
            <FormControl>
              <Input type="text" placeholder="Amount" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>
        <FormField v-slot="{ componentField }" name="store">
          <FormItem>
            <FormControl>
              <Input type="text" placeholder="Store" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>
      </form>
      <DrawerFooter class="flex flex-row justify-between">
        <DrawerClose>
          <Button variant="ghost" class="text-red-500">Cancel</Button>
        </DrawerClose>
        <DrawerClose>
          <Button class="max-w-min" type="submit" @click.prevent="onSubmit">Submit</Button>
        </DrawerClose>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
</template>
