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
  toast('Successfully sent invite', {
    description: `An invite was sent to ${values.email}`
  });
});
</script>

<template>
  <Drawer v-model:open="isDrawerOpen">
    <DrawerTrigger>
      <button class="rounded-full p-1 hover:bg-accent-foreground/15">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="size-6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
    </DrawerTrigger>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>Invite someone to join the {{ selectedList?.name }} list</DrawerTitle>
        <DrawerDescription>The invited person will be able to see the list</DrawerDescription>
        <Alert variant="destructive">
          <AlertCircle class="h-4 w-4" />
          <AlertTitle>Work In Progress</AlertTitle>
          <AlertDescription> This function does not yet work </AlertDescription>
        </Alert>
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
