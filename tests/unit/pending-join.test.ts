import { beforeEach, describe, expect, it } from 'vitest';
import { clearPendingJoin, peekPendingJoin, savePendingJoin } from '~~/utils/pending-join';

beforeEach(() => localStorage.clear());

describe('pending join token', () => {
  it('survives being read, so a failed join can be retried', () => {
    savePendingJoin('abc');
    expect(peekPendingJoin()).toBe('abc');
    expect(peekPendingJoin()).toBe('abc');
  });

  it('is cleared once its join finished', () => {
    savePendingJoin('abc');
    clearPendingJoin('abc');
    expect(peekPendingJoin()).toBeNull();
  });

  it('keeps a newer code when an older join finishes', () => {
    savePendingJoin('old');
    savePendingJoin('new');
    clearPendingJoin('old');
    expect(peekPendingJoin()).toBe('new');
  });
});
