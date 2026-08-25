import { describe, it, expect } from 'vitest';
import { remoteWins } from '~~/utils/sync-merge';

const rec = (updated_at: string, deleted_at: string | null = null) => ({
  id: 'x',
  updated_at,
  deleted_at
});

describe('remoteWins', () => {
  it('accepts a remote record we have never seen', () => {
    expect(remoteWins(undefined, { updated_at: '2026-01-01T00:00:00.000Z' })).toBe(true);
  });

  it('accepts a strictly newer remote record', () => {
    expect(
      remoteWins(rec('2026-01-01T00:00:00.000Z'), { updated_at: '2026-01-02T00:00:00.000Z' })
    ).toBe(true);
  });

  it('rejects an older remote record', () => {
    expect(
      remoteWins(rec('2026-01-02T00:00:00.000Z'), { updated_at: '2026-01-01T00:00:00.000Z' })
    ).toBe(false);
  });

  it('rejects an identical timestamp, so a pull of our own push is a no-op', () => {
    expect(
      remoteWins(rec('2026-01-01T00:00:00.000Z'), { updated_at: '2026-01-01T00:00:00.000Z' })
    ).toBe(false);
  });

  it('lets a newer tombstone win over a live local record', () => {
    const local = rec('2026-01-01T00:00:00.000Z');
    const remote = {
      updated_at: '2026-01-02T00:00:00.000Z',
      deleted_at: '2026-01-02T00:00:00.000Z'
    };
    expect(remoteWins(local, remote)).toBe(true);
  });

  it('lets a newer live record win over a local tombstone, so delete-then-undelete works', () => {
    const local = rec('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    expect(remoteWins(local, { updated_at: '2026-01-02T00:00:00.000Z' })).toBe(true);
  });
});
