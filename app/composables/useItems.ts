import type { Ref, ComputedRef } from 'vue';
import { liveQuery } from 'dexie';
import { db, notifyLocalChange } from '~~/utils/legacy-db';
import { buildItem, queueDelta, queueSet } from '~~/utils/item-ops';
import type { ItemRecord, OpField } from '~~/types/sync';

// Module-level, not per-mount: one live subscription shared by every component,
// so the data is already populated when a page mounts.
const items = ref<ItemRecord[]>([]);
const loading = ref(true);
let started = false;

function ensureStarted(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  liveQuery(() => db.items.filter((i) => i.deleted_at === null).toArray()).subscribe({
    next: (rows) => {
      items.value = rows;
      loading.value = false;
    },
    error: (e) => {
      loading.value = false;
      console.error('useItems:', e);
    }
  });
}

/** Fields the LWW path owns. The two counters are absent by design. */
type ItemPatch = Partial<Pick<ItemRecord, 'name' | 'location' | 'store' | 'amount_type' | 'default_amount'>>;

// `listId` is a computed in every caller, so it must accept ComputedRef too —
// ComputedRef is read-only and not assignable to the mutable Ref type.
export function useItems(listId?: Ref<string | null> | ComputedRef<string | null>) {
  onBeforeMount(ensureStarted);
  const user = useSupabaseUser();
  const actor = computed(() => user.value?.email ?? null);

  const scoped = computed(() =>
    listId?.value ? items.value.filter((i) => i.list_id === listId.value) : items.value
  );
  const inventoryItems = computed(() => scoped.value.filter((i) => i.amount > 0));
  const buyItems = computed(() => scoped.value.filter((i) => i.amount_to_purchase > 0));

  async function create(input: {
    list_id: string;
    name: string;
    location: string;
    store: string;
    amount_type: string;
    default_amount: number;
    amount?: number;
    amount_to_purchase?: number;
  }): Promise<string> {
    const item = buildItem({
      list_id: input.list_id,
      name: input.name,
      location: input.location.trim(),
      store: input.store.trim(),
      amount_type: input.amount_type,
      default_amount: input.default_amount,
      created_by: actor.value
    });
    await db.items.add(item);
    notifyLocalChange('items', item.id);

    if (Number(input.amount)) await queueSet(item, 'amount', Number(input.amount), actor.value);
    if (Number(input.amount_to_purchase)) {
      await queueSet(item, 'amount_to_purchase', Number(input.amount_to_purchase), actor.value);
    }
    return item.id;
  }

  /**
   * Non-counter fields only. Counters go through addDelta / setAmount.
   *
   * Keys whose value is `undefined` are dropped rather than written. Callers
   * routinely pass a partial payload — `Item.vue` emits a spread of its own
   * props, which carries no `location` or `store` — and writing those through
   * would blank the item's category on every amount change.
   */
  async function update(id: string, patch: ItemPatch): Promise<void> {
    const changes = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(changes).length === 0) return;
    if (changes.default_amount !== undefined) changes.default_amount = Number(changes.default_amount) || 0;

    await db.items.update(id, { ...changes, updated_at: new Date().toISOString() });
    notifyLocalChange('items', id);
  }

  async function remove(id: string): Promise<void> {
    const now = new Date().toISOString();
    await db.items.update(id, { deleted_at: now, updated_at: now });
    notifyLocalChange('items', id);
  }

  const addDelta = (item: ItemRecord, field: OpField, delta: number) =>
    queueDelta(item, field, delta, actor.value);

  const setAmount = (item: ItemRecord, field: OpField, value: number) =>
    queueSet(item, field, value, actor.value);

  return { items: scoped, loading, inventoryItems, buyItems, create, update, remove, addDelta, setAmount };
}
