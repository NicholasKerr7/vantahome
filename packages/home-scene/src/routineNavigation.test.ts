import { describe, expect, it } from 'vitest';
import { parseRoutineNavigation } from './routineNavigation';

const request = { channel: 'vantahome-navigation', version: 1, type: 'device-routines', deviceId: 'living-light' } as const;

describe('device routine navigation boundary', () => {
  it('accepts structured web and serialized native requests without granting command data', () => {
    expect(parseRoutineNavigation(request)).toEqual(request);
    expect(parseRoutineNavigation(JSON.stringify(request))).toEqual(request);
    expect(parseRoutineNavigation({ ...request, deviceId: 'entry-gate' })?.deviceId).toBe('entry-gate');
  });

  it.each([
    null, undefined, true, 1, [], [request], '{}', 'not JSON',
    { ...request, channel: 'vantahome-simulation' },
    { ...request, version: '1' },
    { ...request, version: 2 },
    { ...request, type: 'toggle' },
    { ...request, deviceId: '' },
    { ...request, deviceId: 'd2' },
    { ...request, deviceId: 'unknown-device' },
    { ...request, deviceId: 2 },
    { ...request, deviceId: ['living-light'] },
    { ...request, changes: { on: true } },
    { ...request, homeId: 'another-home' },
    { channel: request.channel, version: 1, deviceId: request.deviceId },
    Object.create(request),
  ])('rejects malformed, command-bearing or out-of-catalog payload %#', (input) => {
    expect(parseRoutineNavigation(input)).toBeNull();
  });

  it('bounds serialized input before parsing, including whitespace-padded valid JSON', () => {
    const encoded = JSON.stringify(request);
    expect(parseRoutineNavigation(encoded.padEnd(256, ' '))).toEqual(request);
    expect(parseRoutineNavigation(encoded.padEnd(257, ' '))).toBeNull();
    expect(parseRoutineNavigation('x'.repeat(1000))).toBeNull();
  });
});
