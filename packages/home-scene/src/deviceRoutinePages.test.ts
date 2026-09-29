import { describe, expect, it } from 'vitest';
import { DEVICE_KINDS, getCapabilities, getControlPages, type DeviceKind } from './deviceCapabilities';
import { getInspectorPages } from './deviceRoutinePages';

const genericScheduleFields = ['scheduleEnabled', 'scheduleHour', 'scheduleMinute', 'scheduleDays'];

describe('shared routine entry in device controls', () => {
  it.each([2, 3] as const)('removes only generic schedule preferences and retains every other control at capacity %i', (capacity) => {
    for (const kind of DEVICE_KINDS) {
      const original = getCapabilities(kind);
      const pages = getInspectorPages({ kind }, capacity);
      const actual = pages.flatMap((page) => page.capabilities);
      const expected = original.filter((capability) => !('field' in capability && genericScheduleFields.includes(capability.field)));
      expect(actual.map((control) => control.id).sort(), kind).toEqual(expected.map((control) => control.id).sort());
      expect(new Set(pages.map((page) => page.id)).size, kind).toBe(pages.length);
      for (const page of pages) {
        expect(page.capabilities.length, `${kind}/${page.id}`).toBeLessThanOrEqual(page.compact ? 6 : capacity);
        if (page.id !== 'shared-routines') expect(page.capabilities.length).toBeGreaterThan(0);
      }
      const supportsTiming = getControlPages({ kind }).some((page) => page.group === 'schedule');
      expect(pages.filter((page) => page.id === 'shared-routines'), kind).toHaveLength(supportsTiming ? 1 : 0);
    }
  });

  it.each([
    ['light', ['autoOffMin']],
    ['fan', ['fanTimerMin']],
    ['coffee', ['coffeeKeepWarmMin', 'coffeeAutoBrewTime']],
    ['stove', ['stoveTimerMin']],
    ['water-heater', ['heaterScheduleEnabled', 'vacationDays']],
    ['sprinkler', ['durationMin']],
    ['microwave', ['timeRemainingSec']],
  ] satisfies [DeviceKind, string[]][])('keeps %s appliance timers and timing settings editable', (kind, fields) => {
    const controls = getInspectorPages({ kind }, 2).flatMap((page) => page.capabilities);
    for (const field of fields) expect(controls.some((control) => 'field' in control && control.field === field), field).toBe(true);
  });

  it('places the shared entry before the remaining timer and status pages', () => {
    const pages = getInspectorPages({ kind: 'coffee' }, 2);
    const index = pages.findIndex((page) => page.id === 'shared-routines');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(pages[index]).toMatchObject({ label: 'Routines', group: 'schedule', capabilities: [], compact: false });
    expect(pages.slice(0, index).every((page) => page.group === 'controls' || page.group === 'modes')).toBe(true);
    expect(pages.slice(index + 1).some((page) => page.group === 'schedule')).toBe(true);
  });

  it('does not introduce a scheduling destination into a monitoring-only device', () => {
    expect(getInspectorPages({ kind: 'smoke' }, 2).some((page) => page.id === 'shared-routines')).toBe(false);
  });
});
