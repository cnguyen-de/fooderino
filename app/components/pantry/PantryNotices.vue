<script setup lang="ts">
import { toast } from 'vue-sonner';
const { rejections } = usePantry();
const seen = useState<string[]>('pantry-notices-seen', () => []);
watch(
  rejections,
  (notices) => {
    for (const n of notices) {
      if (seen.value.includes(n.command)) continue;
      seen.value.push(n.command);
      const name = n.item_name ?? 'that item';
      const messages = {
        insufficient_stock: `Someone already used the last ${name}`,
        bag_closed: `${name} was already put away`,
        cannot_undo: 'That change can no longer be undone.',
        not_found: `${name} is no longer available.`,
        not_member: 'You are no longer in this household.',
        invalid: `Could not save the change to ${name}.`,
        malformed: 'Could not save that change. Please try again.'
      };
      toast.error(messages[n.reason]);
    }
  },
  { immediate: true }
);
</script>
<template><span hidden /></template>
