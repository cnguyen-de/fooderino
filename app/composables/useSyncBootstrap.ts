import { resolveAccountChange } from '~~/utils/account';
import { getSyncState } from '~~/utils/sync-state';
import { db } from '~~/utils/db';

/**
 * Called once by app.vue. Page layouts only read sync-hydrated: mounting a
 * new page must not restart the engine or recreate its Realtime subscription.
 */
export function useSyncBootstrap() {
  const user = useSupabaseUser();
  const { start, stop } = useSyncEngine();
  const hydrated = useState<boolean>('sync-hydrated', () => false);

  async function boot(userId: string | null): Promise<void> {
    if (!userId) {
      stop();
      hydrated.value = false;
      return;
    }

    await resolveAccountChange(userId);
    // A device that has pulled before opens at once; a first launch waits for one attempt.
    hydrated.value = (await getSyncState(db)).hydrated_at !== null;
    await start();
    hydrated.value = true;
  }

  onMounted(() => {
    void boot(user.value?.id ?? null);
  });

  watch(
    () => user.value?.id ?? null,
    (userId) => {
      void boot(userId);
    }
  );

  return { hydrated };
}
