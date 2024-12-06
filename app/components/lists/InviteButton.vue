<script setup lang="ts">
import { useListStore } from '~/store/list';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useForm } from 'vee-validate';
import { AlertCircle } from 'lucide-vue-next';
import { useInviteStore } from '~/store/invites';
import { toast } from 'vue-sonner';

const listStore = useListStore();
const { selectedList } = toRefs(listStore);
const formSchema = toTypedSchema(
  z.object({
    email: z.string().min(1).max(50)
  })
);
const form = useForm({
  validationSchema: formSchema
});

const inviteStore = useInviteStore();
const isDrawerOpen = ref(false);
const onSubmit = form.handleSubmit(async (values) => {
  //send invite
  //add feedback that invite was successfully sent
  await inviteStore.sendInvite(values.email, selectedList.value.id);
  isDrawerOpen.value = false;
});
</script>

<template>
  <Drawer v-model:open="isDrawerOpen">
    <DrawerTrigger>
      <button class="flex size-8 items-center justify-center rounded-full hover:bg-accent-foreground/15">
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
            d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
        </svg>
      </button>
    </DrawerTrigger>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>Invite someone to join the {{ selectedList?.name }} list</DrawerTitle>
        <DrawerDescription>The invited person will be able to see and edit the list</DrawerDescription>
      </DrawerHeader>
      <form class="space-y-2 p-4" @submit="onSubmit">
        <FormField v-slot="{ componentField }" name="email">
          <FormItem>
            <FormControl>
              <Input type="text" placeholder="Email" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>
      </form>
      <DrawerFooter>
        <div class="flex flex-row justify-between">
          <DrawerClose>
            <Button class="text-red-500" variant="ghost"> Cancel </Button>
          </DrawerClose>
          <DrawerClose>
            <Button type="submit" @click.prevent="onSubmit">Submit</Button>
          </DrawerClose>
        </div>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
</template>

<style scoped></style>
