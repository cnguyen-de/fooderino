<script setup lang="ts">
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import ItemSheet from '~/components/pantry/ItemSheet.vue';
import SeasonRow from '~/components/seasons/SeasonRow.vue';
import type { ItemId, PantryItem } from '~~/types/pantry';
import type { CalendarEntry, Month, ProduceKind } from '~~/types/season';
import type { UndoHandle } from '~/composables/usePantry';
import {
  addMonths,
  buildSeasonView,
  linkEdit,
  monthName,
  monthOf,
  rowKind,
  type SeasonRow as Row
} from '~~/utils/seasons';
import { SEASON_CALENDAR } from '~~/utils/seasons/calendar';
const { view, ops, today } = usePantry();
const act = usePantryAction();
const current = computed(() => monthOf(today.value));
/** Null follows the current month, also across a month change while the page is open. */
const chosen = ref<Month | null>(null);
const month = computed(() => chosen.value ?? current.value);
const allMonths = ref(false);
const MONTHS = Array.from({ length: 12 }, (_, i) => (i + 1) as Month);
const toggle = ref<{ $el: HTMLElement } | null>(null);
function choose(m: Month) {
  chosen.value = m === current.value ? null : m;
}
function pick(m: Month) {
  choose(m);
  allMonths.value = false;
  // The grid's buttons unmount with it, so focus would fall back to the page.
  nextTick(() => toggle.value?.$el.focus());
}
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
function toastUndo(message: string, handles: UndoHandle[]) {
  toast(message, {
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
async function link(entry: CalendarEntry, item: PantryItem) {
  try {
    const handle = await ops.editItem(item.id, linkEdit(item, entry));
    if (handle) toastUndo(`${item.name} now counts as ${entry.name}`, [handle]);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not link that item.');
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
  if (handles.length) toastUndo(`Filled ${handles.length} season${handles.length === 1 ? '' : 's'}`, handles);
}
</script>
<template>
  <NuxtLayout name="app">
    <div class="space-y-4 p-3">
      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <h1 class="text-xl font-semibold tracking-tight">Seasons<span class="text-primary">.</span></h1>
          <div class="flex items-center gap-1.5">
            <div class="flex w-44 items-center rounded-lg bg-muted p-0.5">
              <Button
                variant="ghost"
                size="icon"
                class="size-8 shrink-0 text-muted-foreground focus-visible:ring-inset focus-visible:ring-offset-0"
                aria-label="Previous month"
                @click="choose(addMonths(month, -1))"
                ><ChevronLeft class="size-4" aria-hidden="true"
              /></Button>
              <h2 class="min-w-0 flex-1 text-center text-sm font-semibold" aria-live="polite">
                {{ monthName(month, 'long') }}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                class="size-8 shrink-0 text-muted-foreground focus-visible:ring-inset focus-visible:ring-offset-0"
                aria-label="Next month"
                @click="choose(addMonths(month, 1))"
                ><ChevronRight class="size-4" aria-hidden="true"
              /></Button>
            </div>
            <Button
              ref="toggle"
              variant="ghost"
              size="icon"
              class="size-9 shrink-0 text-muted-foreground focus-visible:ring-inset focus-visible:ring-offset-0 aria-expanded:bg-primary/10 aria-expanded:text-primary"
              aria-label="All months"
              :aria-expanded="allMonths"
              @click="allMonths = !allMonths"
              ><CalendarDays class="size-4" aria-hidden="true"
            /></Button>
          </div>
        </div>
        <div v-if="allMonths" role="group" aria-label="Months" class="grid grid-cols-3 gap-1 rounded-lg bg-muted p-0.5">
          <button
            v-for="m in MONTHS"
            :key="m"
            type="button"
            :aria-pressed="m === month"
            :aria-label="m === current ? `${monthName(m, 'long')}, this month` : monthName(m, 'long')"
            class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            :class="m === month ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="pick(m)">
            <span class="relative"
              >{{ monthName(m)
              }}<span
                v-if="m === current"
                data-today
                class="absolute -right-2 top-0 size-1.5 rounded-full bg-primary"
                aria-hidden="true"
            /></span>
          </button>
        </div>
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
            @list="list(row)"
            @link="row.source === 'calendar' && link(row.entry, $event)" />
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
          @list="list(row)"
          @link="row.source === 'calendar' && link(row.entry, $event)" />
      </section>
    </div>
    <ItemSheet :id="selected" @close="selected = null" />
  </NuxtLayout>
</template>
