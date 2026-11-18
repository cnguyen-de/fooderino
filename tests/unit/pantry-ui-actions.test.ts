import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'vue-sonner';
import { usePantryAction } from '../../app/composables/usePantryAction';

vi.mock('vue-sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('pantry UI actions', () => {
  it('offers undo only for an applied change and uses its exact handle', async () => {
    const undo = vi.fn().mockResolvedValue(null);
    vi.stubGlobal('usePantry', () => ({ ops: { undo } }));
    const act = usePantryAction();
    await act(async () => null, 'Used milk');
    expect(toast).not.toHaveBeenCalled();
    const handle = { commands: [], sheet: null };
    await act(async () => handle, 'Used milk');
    const options = vi.mocked(toast).mock.calls[0]![1]!;
    options.action &&
      typeof options.action !== 'string' &&
      'onClick' in options.action &&
      options.action.onClick?.({} as MouseEvent);
    expect(undo).toHaveBeenCalledWith(handle);
  });

  it('surfaces failed writes without announcing success', async () => {
    vi.stubGlobal('usePantry', () => ({ ops: {} }));
    await usePantryAction()(async () => {
      throw new Error('Not in a household');
    }, 'Saved');
    expect(toast.error).toHaveBeenCalledWith('Not in a household');
    expect(toast).not.toHaveBeenCalled();
  });
});
