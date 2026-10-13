import { type CurrentReport } from './currentReports';

/** Foreground-only transition tracking: restored conditions are a silent baseline, never replayed alarms. */
export class ConditionTransitions {
  private previous: Set<string> | null = null;

  /** Reset across background gaps because this client cannot observe what happened while closed. */
  pause(): void { this.previous = null; }

  /** Compare conditions, not numeric fluctuations, to send once until a condition actually clears. */
  update(reports: readonly CurrentReport[]): readonly CurrentReport[] {
    const current = new Set(reports.map(report => report.id));
    const newReports = this.previous === null ? [] : reports.filter(report => !this.previous!.has(report.id)
      && report.notify && (report.age === 'simulation' || report.age === 'recent'));
    this.previous = current;
    return newReports;
  }
}
