<script setup lang="ts">
import { ChevronDown, Plus } from 'lucide-vue-next';
import ItemSheet from '~/components/pantry/ItemSheet.vue';
import type { ItemId, PantryItem } from '~~/types/pantry';
import { formatSeason, monthOf, seasonalItems, type SeasonGroup } from '~~/utils/seasons';
const { view, ops, today } = usePantry();
const act = usePantryAction();
const month = computed(() => monthOf(today.value));
const GROUPS: { group: SeasonGroup; label: string; open: boolean }[] = [
  { group: 'now', label: 'In season', open: true },
  { group: 'soon', label: 'Upcoming', open: true },
  { group: 'off', label: 'Not available', open: false }
];
const groups = computed(() => {
  const rows = seasonalItems(view.value.items, month.value);
  return GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => r.group === g.group) })).filter((g) => g.rows.length);
});
const selected = ref<ItemId | null>(null);
const status = ({ amount, to_buy }: PantryItem) =>
  [amount > 0 && 'in stock', to_buy > 0 && 'on list'].filter(Boolean).join(' · ');
</script>
<template>
  <NuxtLayout name="app">
    <div class="space-y-4 p-3">
      <h1 class="text-xl font-semibold tracking-tight">Seasons<span class="text-primary">.</span></h1>
      <p v-if="!groups.length" class="text-sm text-muted-foreground">
        Your items show here once they have a season, set in the item editor.
      </p>
      <Collapsible
        v-for="{ group, label, open, rows } in groups"
        :key="group"
        :default-open="open"
        class="group/season space-y-1"
        ><CollapsibleTrigger
          class="flex h-8 w-full items-center gap-2 rounded-md text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          ><span class="flex-1">{{ label }}</span
          ><span
            class="min-w-6 rounded-md bg-muted px-1.5 py-0.5 text-center text-[10px] tabular-nums tracking-normal"
            >{{ rows.length }}</span
          ><ChevronDown
            class="size-3.5 transition-transform group-data-[state=open]/season:rotate-180"
            aria-hidden="true" /></CollapsibleTrigger
        ><CollapsibleContent>
          <ul class="space-y-1">
            <li
              v-for="{ item, season } in rows"
              :key="item.id"
              class="flex min-h-11 items-center gap-2 rounded-lg bg-muted/40 py-1 pl-2.5 pr-0.5 text-sm transition-colors focus-within:bg-muted/80 hover:bg-muted/80">
              <button type="button" class="min-w-0 flex-1 text-left" @click="selected = item.id">
                <span class="block truncate font-medium" :title="item.name">{{ item.name }}</span>
                <span class="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                  <span>{{ formatSeason(season) }}</span>
                  <span
                    v-if="group === 'now' && season.to === month"
                    class="font-medium text-amber-600 dark:text-amber-400"
                    >· Ends this month</span
                  >
                  <span v-if="status(item)">· {{ status(item) }}</span>
                </span>
              </button>
              <Button
                variant="ghost"
                size="xs"
                class="shrink-0 gap-0.5 text-xs text-primary hover:bg-primary/10 hover:text-primary"
                :aria-label="`Add ${item.name} to shopping list`"
                @click="act(() => ops.addToShopping(item.id), `Listed ${item.name}`)"
                ><Plus class="size-3" aria-hidden="true" />List</Button
              >
            </li>
          </ul></CollapsibleContent
        ></Collapsible
      >
    </div>
    <ItemSheet :id="selected" @close="selected = null" />
  </NuxtLayout>
</template>
