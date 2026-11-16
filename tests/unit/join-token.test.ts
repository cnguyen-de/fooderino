import { describe, it, expect } from 'vitest';
import { validateToken } from '~~/utils/join-token';

const NOW = new Date('2026-06-01T12:00:00.000Z');

describe('validateToken', () => {
  it('rejects a token that does not exist', () => {
    expect(validateToken(null, NOW)).toBe('missing');
  });

  it('accepts a live, unexpired token', () => {
    expect(validateToken({ expires_at: '2026-06-02T12:00:00.000Z', revoked_at: null }, NOW)).toBe('ok');
  });

  it('rejects an expired token', () => {
    expect(validateToken({ expires_at: '2026-05-31T12:00:00.000Z', revoked_at: null }, NOW)).toBe('expired');
  });

  it('rejects a revoked token even while unexpired', () => {
    expect(
      validateToken({ expires_at: '2026-06-02T12:00:00.000Z', revoked_at: '2026-06-01T09:00:00.000Z' }, NOW)
    ).toBe('revoked');
  });

  it('treats the exact expiry instant as expired', () => {
    expect(validateToken({ expires_at: '2026-06-01T12:00:00.000Z', revoked_at: null }, NOW)).toBe('expired');
  });
});
