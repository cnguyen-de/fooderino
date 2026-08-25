import { resolveAccountChange } from '~~/utils/account';
import { getSyncState, setSyncState } from '~~/utils/sync-state';

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
    hydrated.value = (await getSyncState()).hydrated_at !== null;

    await start();

    if (!hydrated.value) {
      await setSyncState({ hydrated_at: new Date().toISOString() });
      hydrated.value = true;
    }
  }

  onMounted(() => {
    void boot(user.value?.id ?? null);
  });

  watch(user, (u) => {
    void boot(u?.id ?? null);
  });

  return { hydrated };
}
