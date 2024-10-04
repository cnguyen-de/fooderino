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
const onSubmit = () => {
  console.log('submit');
};
</script>

<template>
  <Drawer class="">
    <DrawerTrigger class="text-blue-200">+</DrawerTrigger>
    <DrawerContent class="mx-auto max-w-xl">
      <DrawerHeader>
        <DrawerTitle>Add new item</DrawerTitle>
        <DrawerDescription>This action cannot be undone.</DrawerDescription>
      </DrawerHeader>
      <form class="w-2/3 space-y-6 p-4" @submit="onSubmit">
        <FormField v-slot="{ componentField }" name="username">
          <FormItem>
            <FormControl>
              <Input type="text" placeholder="Name" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
          <FormItem>
            <Select v-bind="componentField">
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
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
      </form>
      <DrawerFooter class="flex flex-row justify-between">
        <DrawerClose>
          <Button variant="ghost" class="text-red-500"> Cancel </Button>
        </DrawerClose>
        <Button class="max-w-min" type="submit" @click="">Submit</Button>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
</template>
