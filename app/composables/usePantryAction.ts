import { toast } from 'vue-sonner';
import type { UndoHandle } from './usePantry';

export function usePantryAction() {
  const { ops } = usePantry();
  return async (work: () => Promise<UndoHandle | null>, message?: string) => {
    try {
      const handle = await work();
      if (handle && message)
        toast(message, {
          action: {
            label: 'Undo',
            onClick: () => {
              void ops.undo(handle).catch((e) => toast.error(e.message));
            }
          }
        });
      return handle;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save that change.');
      return null;
    }
  };
}
