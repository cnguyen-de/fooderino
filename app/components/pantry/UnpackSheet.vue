<script setup lang="ts">
import type { BagId, PantryItem } from '~~/types/pantry';
import { addDays, formatAmount, localDate } from '~~/utils/pantry';
import { MapPin } from 'lucide-vue-next';
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [boolean] }>();
const { view, ops } = usePantry();
const act = usePantryAction();
const places = ref<Record<string, string>>({});
const ids = ref<BagId[]>([]);
const busy = ref(false);
const lines = computed(() => view.value.shopping.bag.filter((line) => ids.value.includes(line.id)));
const choices = computed(() => view.value.home.byPlace.map((g) => g.name).filter(Boolean));
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    ids.value = view.value.shopping.bag.map((l) => l.id);
    places.value = {};
    for (const line of view.value.shopping.bag)
      places.value[line.id] = line.item.tags.find((t) => t.kind === 'place')?.name ?? '';
  }
);
/** Best-before comes from the item's shelf life, if it has one; there is no field for it here. */
function bestBefore(item: PantryItem) {
  if (item.shelf_life_days === null) return null;
  const now = new Date();
  const today = localDate(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  );
  return addDays(today, item.shelf_life_days);
}
async function unpack() {
  busy.value = true;
  const handle = await act(
    () =>
      ops.unpack(
        lines.value.map((line) => ({
          bag_id: line.id,
          ...(bestBefore(line.item) ? { best_before: bestBefore(line.item)! } : {}),
          ...(places.value[line.id]?.trim() ? { place: places.value[line.id]!.trim() } : {})
        }))
      ),
    'Everything put away'
  );
  busy.value = false;
  if (handle) emit('update:open', false);
}
</script>
<template>
  <Drawer :open="open" @update:open="emit('update:open', $event)"
    ><DrawerContent class="mx-auto max-h-[90dvh] max-w-xl"
      ><DrawerHeader
        ><DrawerTitle>Unpack at home</DrawerTitle
        ><DrawerDescription>Check where things go.</DrawerDescription></DrawerHeader
      >
      <form class="space-y-3 overflow-y-auto px-4 pb-4" @submit.prevent="unpack">
        <ul class="divide-y rounded-xl border">
          <li v-for="line in lines" :key="line.id" class="flex min-h-11 items-center gap-2 px-3 py-1.5 text-sm">
            <span class="min-w-0 flex-1 truncate font-medium" :title="line.item.name"
              >{{ line.item.name
              }}<span class="font-normal tabular-nums text-muted-foreground">
                ×{{ formatAmount(line.qty, line.item.unit) }}</span
              ></span
            >
            <span
              v-if="line.item.tags.some((t) => t.kind === 'place')"
              class="flex shrink-0 items-center gap-1 text-muted-foreground"
              ><MapPin class="size-3.5" aria-hidden="true" />{{ places[line.id] }}</span
            >
            <Input
              v-else
              v-model="places[line.id]"
              :aria-label="`Place for ${line.item.name}`"
              list="unpack-places"
              placeholder="Place"
              class="h-8 w-36 shrink-0 text-base" />
          </li>
        </ul>
        <datalist id="unpack-places"><option v-for="place in choices" :key="place!" :value="place!" /></datalist
        ><Button type="submit" class="h-10 w-full" :disabled="busy || !lines.length">Put everything away</Button
        ><Button type="button" variant="ghost" class="h-9 w-full" @click="emit('update:open', false)">Close</Button>
      </form></DrawerContent
    ></Drawer
  >
</template>
