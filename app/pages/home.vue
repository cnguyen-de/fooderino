<script setup lang="ts">
import PantryRow from '~/components/pantry/PantryRow.vue';
import SearchDock from '~/components/pantry/SearchDock.vue';
import ItemSheet from '~/components/pantry/ItemSheet.vue';
import { ChevronDown, MapPin } from 'lucide-vue-next';
import type { ItemId, PantryItem } from '~~/types/pantry';
const { view, search, ops, ready } = usePantry();
const act = usePantryAction();
const query = ref('');
const selected = ref<ItemId | null>(null);
const results = computed(() => search(query.value));
const quickPicks = computed(() => {
  const home = view.value.home;
  const excluded = new Set(home.useSoon.map(({ item }) => item.id));
  const picks = home.mostUsed.filter((item) => item.amount > 0 && !excluded.has(item.id)).slice(0, 10);
  for (const item of picks) excluded.add(item.id);
  const candidates = home.byPlace
    .flatMap((group) => group.items)
    .filter((item) => item.amount > 0 && !excluded.has(item.id))
    .map((item) => ({
      item,
      purchasedAt: view.value.history(item.id).find((event) => event.kind === 'purchase')?.occurred_at
    }))
    .sort(
      (a, b) =>
        (b.purchasedAt ? Date.parse(b.purchasedAt) : 0) - (a.purchasedAt ? Date.parse(a.purchasedAt) : 0) ||
        a.item.name.localeCompare(b.item.name)
    );
  return [...picks, ...candidates.slice(0, 10 - picks.length).map(({ item }) => item)];
});
function use(item: PantryItem, bin = false) {
  return act(() => (bin ? ops.bin(item.id) : ops.useUp(item.id)), `${bin ? 'Binned' : 'Used'} ${item.name}`);
}
function action(item: PantryItem) {
  return item.amount > 0 ? use(item) : act(() => ops.addToShopping(item.id), `Listed ${item.name}`);
}
function matchText(hit: ReturnType<typeof search>[number]) {
  return hit.via === 'tag' && hit.item.tags.some((t) => t.kind === 'store' && t.name === hit.text)
    ? undefined
    : hit.text;
}
</script>
<template>
  <NuxtLayout name="app"
    ><div class="space-y-3 p-3">
      <div class="flex items-baseline justify-between gap-2">
        <h1 class="text-xl font-semibold tracking-tight">At home<span class="text-primary">.</span></h1>
        <span v-if="ready" class="text-xs tabular-nums text-muted-foreground"
          >{{ view.home.byPlace.reduce((n, group) => n + group.items.length, 0) }} items</span
        >
      </div>
      <p v-if="!ready" role="status">Loading your items…</p>
      <section v-else-if="query.trim()" class="space-y-1">
        <h2 class="text-sm text-muted-foreground">Search results</h2>
        <PantryRow
          v-for="hit in results"
          :key="hit.item.id"
          :item="hit.item"
          :matched="matchText(hit)"
          @edit="selected = hit.item.id"
          @action="action(hit.item)" />
        <p v-if="!results.length">Nothing found. Add new items in Shopping.</p>
      </section>
      <template v-else>
        <section v-if="view.home.useSoon.length" class="space-y-1">
          <h2 class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Use soon</h2>
          <div
            v-for="entry in view.home.useSoon"
            :key="entry.item.id"
            class="flex h-9 items-center gap-1 rounded-lg bg-orange-500/10 pl-2.5 pr-0.5">
            <button class="flex h-8 min-w-0 flex-1 items-center gap-2 text-left" @click="selected = entry.item.id">
              <span class="font-semibold">{{ entry.item.name }}</span
              ><span class="shrink-0 text-[10px] font-medium text-orange-700 dark:text-orange-300">{{
                entry.days_left < 0
                  ? `${-entry.days_left} days overdue`
                  : entry.days_left === 0
                    ? 'Today'
                    : `In ${entry.days_left} days`
              }}</span>
            </button>
            <div class="flex shrink-0">
              <Button
                variant="ghost"
                size="xs"
                class="text-xs text-primary hover:bg-primary/10 hover:text-primary"
                :aria-label="`Use ${entry.item.name}`"
                @click="use(entry.item)"
                >Used it</Button
              ><Button
                variant="ghost"
                size="xs"
                class="text-xs text-muted-foreground"
                :aria-label="`Bin ${entry.item.name}`"
                @click="use(entry.item, true)"
                >Binned</Button
              >
            </div>
          </div>
        </section>
        <section v-if="quickPicks.length" class="space-y-1">
          <h2 class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Quick picks</h2>
          <PantryRow
            v-for="item in quickPicks"
            :key="item.id"
            :item="item"
            @edit="selected = item.id"
            @action="action(item)" />
        </section>
        <section class="space-y-1">
          <h2 class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Places</h2>
          <div v-if="view.home.byPlace.length" class="rounded-xl border bg-card px-2">
            <Collapsible
              v-for="group in view.home.byPlace"
              :key="group.name ?? 'unsorted'"
              :default-open="view.home.byPlace.length === 1"
              class="group/place border-b last:border-b-0"
              ><CollapsibleTrigger
                class="flex h-9 w-full items-center justify-between gap-2 rounded-md px-1 text-left text-xs font-medium transition-colors hover:text-primary"
                ><span class="flex min-w-0 items-center gap-2"
                  ><MapPin class="size-3.5 shrink-0 text-primary/70" aria-hidden="true" /><span class="truncate">{{
                    group.name ?? 'Unsorted'
                  }}</span></span
                >
                <span class="flex shrink-0 items-center gap-2"
                  ><span
                    class="min-w-6 rounded-md bg-muted px-1.5 py-0.5 text-center text-[10px] tabular-nums text-muted-foreground"
                    >{{ group.items.length }}</span
                  ><ChevronDown
                    class="size-3.5 text-muted-foreground transition-transform group-data-[state=open]/place:rotate-180"
                    aria-hidden="true" /></span></CollapsibleTrigger
              ><CollapsibleContent class="space-y-1 pb-1"
                ><PantryRow
                  v-for="item in group.items"
                  :key="item.id"
                  :item="item"
                  @edit="selected = item.id"
                  @action="action(item)" /></CollapsibleContent
            ></Collapsible>
          </div>
          <p v-if="!view.home.byPlace.length" class="py-4 text-muted-foreground">
            Your home is empty. Add items in Shopping, then unpack them here.
          </p>
        </section>
      </template>
    </div>
    <SearchDock v-model="query" label="Find something at home" placeholder="Find by name or tag…" />
    <ItemSheet :id="selected" @close="selected = null"
  /></NuxtLayout>
</template>
