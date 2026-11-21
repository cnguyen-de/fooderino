<script setup lang="ts">
import { Plus } from 'lucide-vue-next';
import type { Month } from '~~/types/season';
import { formatSeason, monthName, monthsUntil, rowName, rowSeason, type SeasonRow } from '~~/utils/seasons';
const props = defineProps<{ row: SeasonRow; month: Month; upcoming?: boolean }>();
defineEmits<{ edit: []; list: [] }>();
const name = computed(() => rowName(props.row));
const season = computed(() => rowSeason(props.row));
const when = computed(() => {
  const range = formatSeason(season.value);
  if (!props.upcoming) return range;
  const starts = monthsUntil(season.value, props.month) === 1 ? 'next month' : `from ${monthName(season.value.from)}`;
  return `${starts} · ${range}`;
});
const status = computed(() => {
  if (props.row.source === 'calendar') return 'Never bought';
  const { amount, to_buy } = props.row.item;
  return [amount > 0 && 'in stock', to_buy > 0 && 'on list'].filter(Boolean).join(' · ');
});
</script>
<template>
  <div
    class="flex min-h-11 items-center gap-2 rounded-lg bg-muted/40 py-1 pl-2.5 pr-0.5 text-sm transition-colors focus-within:bg-muted/80 hover:bg-muted/80">
    <component
      :is="row.source === 'item' ? 'button' : 'div'"
      :type="row.source === 'item' ? 'button' : undefined"
      class="min-w-0 flex-1 text-left"
      @click="row.source === 'item' && $emit('edit')">
      <span class="block truncate font-medium" :title="name">{{ name }}</span>
      <span class="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
        <span>{{ when }}</span>
        <span v-if="status">· {{ status }}</span>
        <span v-if="row.endsThisMonth" class="font-medium text-amber-600 dark:text-amber-400">· Ends this month</span>
      </span>
    </component>
    <Button
      variant="ghost"
      size="xs"
      class="shrink-0 gap-0.5 text-xs text-primary hover:bg-primary/10 hover:text-primary"
      :aria-label="`Add ${name} to shopping list`"
      @click="$emit('list')"
      ><Plus class="size-3" aria-hidden="true" />List</Button
    >
  </div>
</template>
