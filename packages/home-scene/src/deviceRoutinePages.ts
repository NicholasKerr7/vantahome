import { getControlPages, type DeviceControlPage } from './deviceCapabilities';
import type { DeviceDefinition } from './data';

const LEGACY_SCHEDULE_FIELDS = new Set(['scheduleEnabled', 'scheduleHour', 'scheduleMinute', 'scheduleDays']);

/** Replace inert generic schedule preferences with one shared-routines entry, retaining device timers. */
export function getInspectorPages(device: Pick<DeviceDefinition, 'kind'>, maxControlsPerPage: 2 | 3): readonly DeviceControlPage[] {
  const pages = getControlPages(device, { maxControlsPerPage });
  const supportsRoutines = pages.some((page) => page.group === 'schedule');
  const retained: DeviceControlPage[] = pages.map((page) => ({ ...page, capabilities: page.capabilities.filter((capability) => !('field' in capability && LEGACY_SCHEDULE_FIELDS.has(capability.field))) }))
    .filter((page) => page.capabilities.length > 0);
  if (!supportsRoutines) return retained;
  const entry: DeviceControlPage = { id: 'shared-routines', label: 'Routines', group: 'schedule', capabilities: [], compact: false };
  const firstTimingPage = retained.findIndex((page) => page.group === 'schedule' || page.group === 'status');
  retained.splice(firstTimingPage < 0 ? retained.length : firstTimingPage, 0, entry);
  return retained;
}
