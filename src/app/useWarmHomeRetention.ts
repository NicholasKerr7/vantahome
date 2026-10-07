import { useEffect, useState } from 'react';

/** Retention is a memory budget, never a period of continued authorization. */
export const HOME_RETENTION_MS = 45_000;
type Lease = { scope: string; accessDeadline: number; startedAt: number | null };
type Input = { admitted: boolean; checking: boolean; scope: string; guestExpiresAt?: string | null };

/** Retain a previously admitted home behind a shield only during one bounded same-scope check. */
export function useWarmHomeRetention({ admitted, checking, scope, guestExpiresAt }: Input): boolean {
  const [lease, setLease] = useState<Lease | null>(null);
  const now = Date.now();
  const accessDeadline = guestExpiresAt ? Date.parse(guestExpiresAt) : Infinity;
  const validDeadline = !Number.isNaN(accessDeadline) && accessDeadline > now;

  // Adjust before committing a render so failed checks, account switches, and
  // expired guests cannot resurrect a retained tree even if Retry follows immediately.
  if (admitted && validDeadline) {
    if (!lease || lease.scope !== scope || lease.accessDeadline !== accessDeadline || lease.startedAt !== null) {
      setLease({ scope, accessDeadline, startedAt: null });
    }
  } else if (lease && (!checking || lease.scope !== scope || lease.accessDeadline <= now)) {
    setLease(null);
  } else if (lease && lease.startedAt === null) {
    setLease({ ...lease, startedAt: now });
  }

  const deadline = lease?.startedAt === null || !lease ? Infinity
    : Math.min(lease.startedAt + HOME_RETENTION_MS, lease.accessDeadline);
  useEffect(() => {
    if (!Number.isFinite(deadline)) return;
    const timer = setTimeout(() => setLease(null), Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [deadline]);

  return !admitted && checking && Boolean(lease && lease.scope === scope && lease.accessDeadline > now && deadline > now);
}
