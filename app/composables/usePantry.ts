import { liveQuery } from 'dexie';
import type { ComputedRef, Ref } from 'vue';
import type { Hit, Instant, LocalDate, PantryItem, PantryView } from '~~/utils/pantry';
import { buildPantryView, buildSearchIndex, DEFAULT_RULES, localDateOf } from '~~/utils/pantry';
import { projectPantry, readDeviceRows, type DeviceRows } from '~~/utils/pantry-projection';
import { createPantryOps, type PantryOps } from '~~/utils/pantry-ops';
import { notifyLocalChange } from '~~/utils/sync-hook';
import { db } from '~~/utils/db';
import type { RejectionNotice } from '~~/types/sync';

export type { ItemDraft, ItemEdit, PantryOps, UndoHandle, UnpackLine } from '~~/utils/pantry-ops';
export type { RejectionNotice } from '~~/types/sync';
export type * from '~~/types/pantry';

/** A search hit with the item it found. */
export type SearchResult = Hit & { item: PantryItem };

const NOTICE_LIMIT = 20;

// Module-level: one live subscription and one projection, shared by every component.
const rows = shallowRef<DeviceRows | null>(null);
const notices = shallowRef<readonly RejectionNotice[]>([]);
const today = ref<LocalDate>(localDateOf(new Date().toISOString() as Instant));
let started = false;

/** The sync engine and the ops both report refused commands here; the UI toasts each once by `command`. */
export function recordRejections(batch: readonly RejectionNotice[]): void {
  notices.value = [...notices.value, ...batch].slice(-NOTICE_LIMIT);
}

function ensureStarted(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  liveQuery(() => readDeviceRows(db, { events: true })).subscribe({
    next: (next) => {
      rows.value = next;
    },
    error: (e) => console.error('usePantry:', e)
  });
  setInterval(() => {
    const now = localDateOf(new Date().toISOString() as Instant);
    if (now !== today.value) today.value = now;
  }, 60_000);
}

const projection = computed(() =>
  projectPantry(
    rows.value ?? { household_id: null, hydrated: false, items: [], bag: [], log: [], commands: [], edits: [] }
  )
);

const historyComplete = computed(() => rows.value?.hydrated ?? false);

const view = computed<PantryView>(() =>
  buildPantryView({
    snapshot: projection.value.snapshot,
    events: projection.value.events,
    today: today.value,
    rules: DEFAULT_RULES,
    historyComplete: historyComplete.value
  })
);

const index = computed(() => buildSearchIndex([...projection.value.snapshot.items.values()]));

function search(query: string): SearchResult[] {
  return index.value(query).flatMap((hit) => {
    const item = view.value.byId(hit.item_id);
    return item ? [{ ...hit, item }] : [];
  });
}

const ops = createPantryOps({
  db,
  notify: () => notifyLocalChange('pantry'),
  onRejection: recordRejections
});

export interface Pantry {
  view: ComputedRef<PantryView>;
  /** Reactive when called inside a computed or template: it reads the current snapshot's index. */
  search: (query: string) => SearchResult[];
  ops: PantryOps;
  /** Recent refused commands, oldest first. */
  rejections: Readonly<Ref<readonly RejectionNotice[]>>;
  /** False until this household's first full pull; buy suggestions stay empty until then. */
  historyComplete: ComputedRef<boolean>;
  /** False until the device has been read once. */
  ready: ComputedRef<boolean>;
}

const ready = computed(() => rows.value !== null);

export function usePantry(): Pantry {
  ensureStarted();
  return { view, search, ops, rejections: notices, historyComplete, ready };
}
