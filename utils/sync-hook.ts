import Dexie from 'dexie';

/** What a local write touched: the household outboxes, or the user's recipes. */
export type LocalChange = 'pantry' | 'recipes';

export type LocalChangeHook = (change: LocalChange) => void;

let hook: LocalChangeHook | null = null;

/** Installed by the sync engine on start, cleared on stop. */
export function setLocalChangeHook(fn: LocalChangeHook | null): void {
  hook = fn;
}

/**
 * Called after every local write. With no engine running (signed out, or before
 * bootstrap) it does nothing, and the write waits in its outbox for the next sync.
 */
export function notifyLocalChange(change: LocalChange): void {
  Dexie.ignoreTransaction(() => hook?.(change));
}
