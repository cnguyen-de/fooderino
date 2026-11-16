export interface ShareTokenRow {
  expires_at: string;
  revoked_at: string | null;
}

export type TokenVerdict = 'ok' | 'expired' | 'revoked' | 'missing';

/** Revocation is checked before expiry so a revoked token never reads as merely stale. */
export function validateToken(row: ShareTokenRow | null, now: Date): TokenVerdict {
  if (!row) return 'missing';
  if (row.revoked_at !== null) return 'revoked';
  if (new Date(row.expires_at).getTime() <= now.getTime()) return 'expired';
  return 'ok';
}
