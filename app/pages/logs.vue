<script setup lang="ts">
import { ArrowDownLeft, ArrowUpRight, ChevronRight, History, Search, SlidersHorizontal, Trash2 } from 'lucide-vue-next';
import ItemSheet from '~/components/pantry/ItemSheet.vue';
import type { ItemId } from '~~/types/pantry';
const { activity, view, ready, historyComplete } = usePantry();
const { state } = useHousehold();
const user = useSupabaseUser();
const route = useRoute();
const query = ref('');
const limit = ref(100);
const selected = ref<ItemId | null>(null);
const itemFilter = computed(() => (typeof route.query.item === 'string' ? (route.query.item as ItemId) : null));
function actorName(actor: string | null, pending: boolean) {
  if (pending || actor === user.value?.id) return 'You';
  if (!actor) return 'Unknown member';
  const member = state.value.kind === 'member' ? state.value.members.find((m) => m.user_id === actor) : undefined;
  return member?.name || member?.email || 'Former member';
}
const filtered = computed(() =>
  activity.value.filter((entry) => {
    if (
      itemFilter.value &&
      !entry.itemIds.some((id) => id === itemFilter.value || view.value.byId(id)?.id === itemFilter.value)
    )
      return false;
    const text = `${entry.names} ${entry.description} ${actorName(entry.actor, entry.pending)}`.toLocaleLowerCase();
    return text.includes(query.value.trim().toLocaleLowerCase());
  })
);
watch([query, itemFilter], () => {
  limit.value = 100;
});
const groups = computed(() => {
  const days = new Map<string, { label: string; entries: typeof filtered.value }>();
  const today = new Date().toDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  for (const entry of filtered.value.slice(0, limit.value)) {
    const date = new Date(entry.at);
    const key = date.toDateString();
    const label =
      key === today
        ? 'Today'
        : key === yesterday.toDateString()
          ? 'Yesterday'
          : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const group = days.get(key) ?? { label, entries: [] };
    group.entries.push(entry);
    days.set(key, group);
  }
  return [...days.values()];
});
const icon = (kind: string) =>
  kind === 'purchase' || kind === 'tick'
    ? ArrowDownLeft
    : kind === 'consume' || kind === 'use'
      ? ArrowUpRight
      : kind === 'waste'
        ? Trash2
        : SlidersHorizontal;
</script>
<template>
  <NuxtLayout name="app">
    <div class="space-y-4 p-3">
      <div class="flex items-center justify-between gap-2">
        <h1 class="text-xl font-semibold tracking-tight">Activity<span class="text-primary">.</span></h1>
        <History class="size-4 text-primary" aria-hidden="true" />
      </div>
      <div v-if="itemFilter" class="flex items-center justify-between gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs">
        <span class="truncate font-medium">{{ view.byId(itemFilter)?.name ?? 'Item history' }}</span
        ><NuxtLink to="/logs" class="shrink-0 text-primary">All activity</NuxtLink>
      </div>
      <div class="relative">
        <Search
          class="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
          aria-hidden="true" /><Input
          v-model="query"
          type="search"
          aria-label="Search activity"
          placeholder="Find an item, person or change…"
          class="h-9 rounded-lg bg-muted/40 pl-9 text-base" />
      </div>
      <p v-if="!ready || !historyComplete" role="status" class="text-xs text-muted-foreground">
        Loading household history…
      </p>
      <section v-for="group in groups" :key="group.label" class="space-y-1">
        <h2 class="py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {{ group.label }}
        </h2>
        <div v-for="entry in group.entries" :key="entry.id" class="flex gap-2.5 rounded-lg bg-muted/30 px-2.5 py-2">
          <span class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
            ><component :is="icon(entry.kind)" class="size-3.5" aria-hidden="true"
          /></span>
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline justify-between gap-2">
              <button
                class="min-w-0 truncate text-left text-sm font-medium hover:text-primary disabled:cursor-default"
                :disabled="!view.byId(entry.itemIds[0]!)"
                @click="selected = view.byId(entry.itemIds[0]!)?.id ?? null">
                {{ entry.names }}</button
              ><time :datetime="entry.at" class="shrink-0 text-[10px] tabular-nums text-muted-foreground">{{
                new Date(entry.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
              }}</time>
            </div>
            <p class="text-xs">
              {{ entry.description
              }}<span class="text-muted-foreground"> · {{ actorName(entry.actor, entry.pending) }}</span>
            </p>
            <p v-if="entry.detail" class="text-[11px] tabular-nums text-muted-foreground">{{ entry.detail }}</p>
            <span v-if="entry.pending" class="text-[10px] text-primary">Waiting to sync</span>
          </div>
        </div>
      </section>
      <p v-if="ready && historyComplete && !filtered.length" class="py-8 text-center text-sm text-muted-foreground">
        {{ query ? 'No matching changes.' : 'No changes recorded yet.' }}
      </p>
      <Button v-if="filtered.length > limit" variant="ghost" class="h-9 w-full gap-1 text-xs" @click="limit += 100"
        >Show more<ChevronRight class="size-3"
      /></Button>
    </div>
    <ItemSheet :id="selected" @close="selected = null" />
  </NuxtLayout>
</template>
