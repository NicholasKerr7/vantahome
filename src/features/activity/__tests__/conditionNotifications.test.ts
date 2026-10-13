import { ConditionTransitions } from '../conditionNotifications';
import type { CurrentReport } from '../currentReports';
const report: CurrentReport = { id: 'air', deviceName: 'Air', title: 'Simulated CO₂ above limit', detail: '620 ppm',
  simulated: true, age: 'simulation', timeLabel: 'Model', warning: true, notify: true };

test('new thresholds notify once, clear then notify again; restored and resumed reports remain silent', () => {
  const observer = new ConditionTransitions();
  expect(observer.update([report])).toEqual([]);
  observer.update([]);
  expect(observer.update([report])).toEqual([report]);
  expect(observer.update([{ ...report, detail: '621 ppm' }])).toEqual([]);
  observer.pause();
  expect(observer.update([report])).toEqual([]);
});

test('never treats missing timestamps or old physical reports as new alarms', () => {
  const observer = new ConditionTransitions();
  observer.update([]);
  expect(observer.update([{ ...report, simulated: false, age: 'unknown' }])).toEqual([]);
  observer.update([]);
  expect(observer.update([{ ...report, simulated: false, age: 'stale' }])).toEqual([]);
  observer.update([]);
  expect(observer.update([{ ...report, simulated: false, age: 'recent' }])).toHaveLength(1);
});

test('disabling notices retains conditions and enabling them does not replay an old condition', () => {
  const observer = new ConditionTransitions();
  observer.update([]);
  expect(observer.update([{ ...report, notify: false }])).toEqual([]);
  expect(observer.update([report])).toEqual([]);
});
