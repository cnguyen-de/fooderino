<script setup lang="ts">
import type { BagId } from '~~/types/pantry';
import { addDays, localDate } from '~~/utils/pantry';
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [boolean] }>();
const { view, ops } = usePantry();
const act = usePantryAction();
const dates = ref<Record<string, string>>({});
const places = ref<Record<string, string>>({});
const ids = ref<BagId[]>([]);
const busy = ref(false);
const lines = computed(() => view.value.shopping.bag.filter((line) => ids.value.includes(line.id)));
const choices = computed(() => view.value.home.byPlace.map((g) => g.name).filter(Boolean));
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const now = new Date();
    const today = localDate(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    );
    ids.value = view.value.shopping.bag.map((l) => l.id);
    dates.value = {};
    places.value = {};
    for (const line of view.value.shopping.bag) {
      dates.value[line.id] = line.item.shelf_life_days === null ? '' : addDays(today, line.item.shelf_life_days);
      places.value[line.id] = line.item.tags.find((t) => t.kind === 'place')?.name ?? '';
    }
  }
);
async function unpack() {
  busy.value = true;
  const handle = await act(
    () =>
      ops.unpack(
        lines.value.map((line) => ({
          bag_id: line.id,
          ...(dates.value[line.id] ? { best_before: localDate(dates.value[line.id]!) } : {}),
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
        ><DrawerDescription>Check where things go and their soonest expiry.</DrawerDescription></DrawerHeader
      >
      <form class="space-y-4 overflow-y-auto p-4" @submit.prevent="unpack">
        <div v-for="line in lines" :key="line.id" class="space-y-3 rounded-xl border p-3">
          <p class="font-semibold">{{ line.item.name }} · {{ line.qty }}</p>
          <p v-if="line.item.tags.some((t) => t.kind === 'place')">→ {{ places[line.id] }}</p>
          <label v-else class="block"
            >Place<Input
              v-model="places[line.id]"
              list="unpack-places"
              placeholder="Choose or enter a place"
              class="text-base" /></label
          ><label class="block">Best-before<Input v-model="dates[line.id]" type="date" class="text-base" /></label>
        </div>
        <datalist id="unpack-places"><option v-for="place in choices" :key="place!" :value="place!" /></datalist
        ><Button type="submit" class="h-12 w-full" :disabled="busy || !lines.length">Put everything away</Button
        ><Button type="button" variant="ghost" class="w-full" @click="emit('update:open', false)">Close</Button>
      </form></DrawerContent
    ></Drawer
  >
</template>
