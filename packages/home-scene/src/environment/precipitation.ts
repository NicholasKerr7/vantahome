/** Convert an interval accumulation to an hourly rate, preserving millimeters or centimeters. */
export function precipitationRatePerHour(amount: number, intervalSeconds: number): number {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(intervalSeconds) || intervalSeconds <= 0) return 0;
  const rate = amount * (3600 / intervalSeconds);
  return Number.isFinite(rate) ? rate : 0;
}
