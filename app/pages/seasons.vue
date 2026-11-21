<script setup lang="ts">
import { ChevronLeft, ChevronRight, Leaf } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import ItemSheet from '~/components/pantry/ItemSheet.vue';
import SeasonRow from '~/components/seasons/SeasonRow.vue';
import type { ItemId } from '~~/types/pantry';
import type { ProduceKind } from '~~/types/season';
import type { UndoHandle } from '~/composables/usePantry';
import { addMonths, buildSeasonView, monthName, monthOf, rowKind, type SeasonRow as Row } from '~~/utils/seasons';
import { SEASON_CALENDAR } from '~~/utils/seasons/calendar';
const { view, ops, today } = usePantry();
const act = usePantryAction();
const current = computed(() => monthOf(today.value));
const offset = ref(0);
const month = computed(() => addMonths(current.value, offset.value));
const seasons = computed(() => buildSeasonView({ items: view.value.items, calendar: SEASON_CALENDAR, month: month.value }));
const KINDS: { kind: ProduceKind | 'other'; label: string }[] = [
  { kind: 'vegetable', label: 'Vegetables' },
  { kind: 'fruit', label: 'Fruits' },
  { kind: 'other', label: 'Other' }
];
const groups = computed(() =>
  KINDS.map((g) => ({ ...g, rows: seasons.value.now.filter((r) => rowKind(r) === g.kind) })).filter((g) => g.rows.length)
);
const selected = ref<ItemId | null>(null);
const key = (row: Row) => (row.source === 'item' ? row.item.id : `calendar:${row.entry.name}`);
async function list(row: Row) {
  if (row.source === 'item') {
    await act(() => ops.addToShopping(row.item.id), `Listed ${row.item.name}`);
    return;
  }
  const { name, aliases, season } = row.entry;
  try {
    if (await ops.createItem({ name, aliases: [...aliases], season, to_buy: 1 })) toast(`Listed ${name}`);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not add that item.');
  }
}
const filling = ref(false);
async function fill() {
  if (filling.value) return;
  filling.value = true;
  const handles: UndoHandle[] = [];
  try {
    for (const { item, season } of seasons.value.fillable) {
      if (view.value.byId(item.id)?.season !== null) continue;
      const handle = await ops.editItem(item.id, { season });
      if (handle) handles.push(handle);
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not fill every season.');
  } finally {
    filling.value = false;
  }
  if (handles.length === 0) return;
  toast(`Filled ${handles.length} season${handles.length === 1 ? '' : 's'}`, {
    action: {
      label: 'Undo',
      onClick: async () => {
        try {
          for (const handle of handles.reverse()) await ops.undo(handle);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Could not undo.');
        }
      }
    }
  });
}
</script>
<template>
  <NuxtLayout name="app">
    <div class="space-y-4 p-3">
      <div class="flex items-center justify-between gap-2">
        <h1 class="text-xl font-semibold tracking-tight">Seasons<span class="text-primary">.</span></h1>
        <Leaf class="size-4 text-primary" aria-hidden="true" />
      </div>
      <div class="flex items-center justify-between gap-2 rounded-lg bg-muted p-0.5">
        <Button
          variant="ghost"
          size="icon"
          class="size-8 text-muted-foreground"
          aria-label="Previous month"
          @click="offset--"
          ><ChevronLeft class="size-4" aria-hidden="true"
        /></Button>
        <div class="min-w-0 text-center" aria-live="polite">
          <p class="text-sm font-semibold">{{ monthName(month, 'long') }}</p>
          <button v-if="offset !== 0" type="button" class="text-[11px] text-primary" @click="offset = 0">
            Back to {{ monthName(current, 'long') }}
          </button>
          <p v-else class="text-[11px] text-muted-foreground">This month</p>
        </div>
        <Button variant="ghost" size="icon" class="size-8 text-muted-foreground" aria-label="Next month" @click="offset++"
          ><ChevronRight class="size-4" aria-hidden="true"
        /></Button>
      </div>
      <div
        v-if="seasons.fillable.length"
        class="flex items-center gap-3 rounded-xl bg-primary/5 p-3 ring-1 ring-inset ring-primary/10">
        <p class="min-w-0 flex-1 text-xs">
          {{ seasons.fillable.length }} of your items match the season calendar.
        </p>
        <Button size="sm" class="h-8 shrink-0" :disabled="filling" @click="fill">Fill seasons</Button>
      </div>
      <section class="space-y-3" aria-labelledby="in-season">
        <h2 id="in-season" class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          In season
        </h2>
        <p v-if="!groups.length" class="text-sm text-muted-foreground">
          Nothing on the season calendar for {{ monthName(month, 'long') }}.
        </p>
        <div v-for="group in groups" :key="group.kind" class="space-y-1">
          <h3 class="text-xs font-medium">{{ group.label }}</h3>
          <SeasonRow
            v-for="row in group.rows"
            :key="key(row)"
            :row="row"
            :month="month"
            @edit="row.source === 'item' && (selected = row.item.id)"
            @list="list(row)" />
        </div>
      </section>
      <section class="space-y-1" aria-labelledby="coming-soon">
        <h2 id="coming-soon" class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Coming soon
        </h2>
        <p v-if="!seasons.soon.length" class="text-sm text-muted-foreground">
          Nothing new comes into season in the two months after {{ monthName(month, 'long') }}.
        </p>
        <SeasonRow
          v-for="row in seasons.soon"
          :key="key(row)"
          :row="row"
          :month="month"
          upcoming
          @edit="row.source === 'item' && (selected = row.item.id)"
          @list="list(row)" />
      </section>
    </div>
    <ItemSheet :id="selected" @close="selected = null" />
  </NuxtLayout>
</template>
