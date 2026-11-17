import { resolveAccountChange } from '~~/utils/account';
import { getSyncState } from '~~/utils/sync-state';
import { db } from '~~/utils/db';

/**
 * Starts the engine for the whole session, from the layout rather than from
 * a settings component. Mounting it on a single route means writes made
 * elsewhere never sync until the user happens to visit that route.
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

  watch(user, (u) => {
    void boot(u?.id ?? null);
  });

  return { hydrated };
}
