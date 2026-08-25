import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('has indexedDB available', () => {
    expect(typeof indexedDB).toBe('object');
  });

  it('has crypto.randomUUID available', () => {
    expect(crypto.randomUUID()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
