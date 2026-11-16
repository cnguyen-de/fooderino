export type SyncCollection =
  | 'lists'
  | 'list_members'
  | 'items'
  | 'logs'
  | 'recipes';

export type LocalChangeHook = (collection: SyncCollection, id: string) => void;

let hook: LocalChangeHook | null = null;

/** Installed by the sync engine on start, cleared on stop. */
export function setLocalChangeHook(fn: LocalChangeHook | null): void {
  hook = fn;
}

/**
 * Called by every repository mutation. When no engine is running — signed
 * out, or before bootstrap — this is a no-op and the write stays local until
 * the next catch-up sweep picks it up by cursor.
 */
export function notifyLocalChange(collection: SyncCollection, id: string): void {
  hook?.(collection, id);
}
