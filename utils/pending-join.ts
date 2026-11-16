/**
 * Holds a share token across the OAuth round trip. Sign-in leaves the app for
 * the provider and comes back on /confirm, which knows nothing about the code
 * the user scanned — without this, joining would silently become "go to the
 * inventory". Storage can throw (private mode, blocked site data), in which
 * case the user simply re-scans after signing in.
 */
const KEY = 'fooderino:pending-join';

export function savePendingJoin(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* best effort */
  }
}

/** Reads and clears in one step, so a stale token can never fire twice. */
export function takePendingJoin(): string | null {
  try {
    const token = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    return token;
  } catch {
    return null;
  }
}
