/**
 * Holds a share token across the OAuth round trip. Sign-in leaves the app for
 * the provider and comes back on /confirm, which knows nothing about the code
 * the user scanned. The token stays until the join succeeds or the server rules
 * it out, so a failed or interrupted join can be retried. Storage can throw
 * (private mode, blocked site data), in which case the user re-scans.
 */
const KEY = 'fooderino:pending-join';

export function savePendingJoin(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* best effort */
  }
}

export function peekPendingJoin(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Clears only `token`, so finishing an old join never drops a newer code. */
export function clearPendingJoin(token: string): void {
  try {
    if (localStorage.getItem(KEY) === token) localStorage.removeItem(KEY);
  } catch {
    /* best effort */
  }
}
