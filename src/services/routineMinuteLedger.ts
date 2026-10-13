import type { HomeState } from '../store/useHomeStore';

type Scope = Pick<HomeState, 'authenticatedUserId' | 'accountUserId' | 'sessionEpoch' | 'activeHomeId' | 'activeMemberId'>;
const RETAIN_MS = 26 * 60 * 60 * 1000;
const MAX_MARKERS = 8192;

/** Retain bounded local execution markers across foreground restarts, without carrying another login's history. */
export class RoutineMinuteLedger {
  private account = '';
  private readonly entries = new Map<string, number>();
  private nextPrune = 0;

  /** Claim a scheduled minute once; editing or re-enabling an already-run routine does not replay it. */
  claim(scope: Scope, routineId: string, minute: string, now: number): boolean {
    const account = JSON.stringify([scope.authenticatedUserId, scope.accountUserId, scope.sessionEpoch]);
    if (account !== this.account) { this.entries.clear(); this.account = account; this.nextPrune = 0; }
    if (now >= this.nextPrune) {
      for (const [key, at] of this.entries) if (now - at > RETAIN_MS) this.entries.delete(key);
      this.nextPrune = now + 60_000;
    }
    const key = JSON.stringify([scope.activeHomeId, scope.activeMemberId, routineId, minute]);
    // Keep every claimed wall minute through a repeated DST hour, including routines with several daily triggers.
    // At the defensive memory limit, pause additional runs rather than discarding protection against duplicates.
    if (this.entries.has(key) || this.entries.size >= MAX_MARKERS) return false;
    this.entries.set(key, now);
    return true;
  }
}
