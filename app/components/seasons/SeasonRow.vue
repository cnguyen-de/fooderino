<script setup lang="ts">
import { Link2, Plus } from 'lucide-vue-next';
import ItemCombobox from '~/components/pantry/ItemCombobox.vue';
import type { PantryItem } from '~~/types/pantry';
import type { Month } from '~~/types/season';
import { formatSeason, monthName, monthsUntil, rowName, rowSeason, type SeasonRow } from '~~/utils/seasons';
const props = defineProps<{ row: SeasonRow; month: Month; upcoming?: boolean }>();
const emit = defineEmits<{ edit: []; list: []; link: [item: PantryItem] }>();
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
const linking = ref(false);
const query = ref('');
function toggle() {
  query.value = '';
  linking.value = !linking.value;
}
function pick(item: PantryItem) {
  linking.value = false;
  emit('link', item);
}
</script>
<template>
  <div class="space-y-1">
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
        v-if="row.source === 'calendar'"
        variant="ghost"
        size="xs"
        class="shrink-0 gap-0.5 text-xs text-muted-foreground"
        :aria-expanded="linking"
        :aria-label="`We buy ${name} under another name`"
        @click="toggle"
        ><Link2 class="size-3" aria-hidden="true" />We buy this</Button
      >
      <Button
        variant="ghost"
        size="xs"
        class="shrink-0 gap-0.5 text-xs text-primary hover:bg-primary/10 hover:text-primary"
        :aria-label="`Add ${name} to shopping list`"
        @click="$emit('list')"
        ><Plus class="size-3" aria-hidden="true" />List</Button
      >
    </div>
    <div v-if="linking" class="flex items-center gap-1.5 pl-2.5">
      <ItemCombobox
        v-model="query"
        :linked="false"
        :label="`Which of your items is ${name}?`"
        placeholder="Which of your items is it?"
        items-only
        auto-focus
        @pick="pick" />
      <Button variant="ghost" size="sm" class="h-9 shrink-0 text-xs" @click="linking = false">Cancel</Button>
    </div>
  </div>
</template>
