import { describe, expect, it } from 'vitest';
import { ARTWORK_KEYS, deviceArtwork, roomArtwork, routineArtwork, sceneArtwork } from './cinematicArtwork';
import { DEVICES, ROOMS } from './data';
import { DEVICE_KINDS } from './deviceCapabilities';

describe('cinematic reference selection', () => {
  it('covers every canonical room and device with bundled reference keys', () => {
    const keys = new Set(ARTWORK_KEYS);
    for (const room of ROOMS) expect(keys.has(roomArtwork(room))).toBe(true);
    for (const device of DEVICES) expect(keys.has(deviceArtwork(device))).toBe(true);
    for (const kind of DEVICE_KINDS) expect(deviceArtwork({ kind })).toBe(`device-${kind}`);
  });

  it('uses canonical bindings before edited display names and picks known fixture variants', () => {
    expect(roomArtwork({ id: 'remote-id', modelRoomId: 'bath-5', name: 'My retreat' })).toBe('room-bathroom');
    expect(deviceArtwork({ kind: 'light', modelDeviceId: 'master-bedside-left', name: 'Read' })).toBe('device-lamp');
    expect(deviceArtwork({ kind: 'light', modelDeviceId: 'street-light-ne' })).toBe('device-street-light');
    expect(deviceArtwork({ kind: 'fan', modelDeviceId: 'bath-2-fan' })).toBe('device-ventilation');
  });

  it('keeps actual preset identity ahead of editable scene names', () => {
    expect(sceneArtwork({ name: 'Morning', modelPreset: 'night' })).toBe('mood-night');
    expect(sceneArtwork({ name: 'Movie', modelPreset: 'away' })).toBe('mood-away');
    expect(sceneArtwork({ name: 'Evening cinema' })).toBe('mood-movie');
    expect(sceneArtwork({ name: 'Custom scene' })).toBe('room-living');
  });

  it('keeps native and public summary artwork consistent without private action data', () => {
    const nativeScene = { name: 'Custom scene', actions: [{ deviceId: 'private-climate-device' }] };
    expect(sceneArtwork(nativeScene)).toBe(sceneArtwork({ name: nativeScene.name }));
    expect(sceneArtwork({ name: 'A restful night' })).toBe('mood-night');
  });

  it('distinguishes safety, water, energy and scheduled routine purposes', () => {
    expect(routineArtwork({ name: 'Gas leak response' })).toBe('device-gas-leak');
    expect(routineArtwork({ name: 'Gas usage alert' })).toBe('device-gas-meter');
    expect(routineArtwork({ name: 'Water leak response' })).toBe('device-water');
    expect(routineArtwork({ name: 'Fire alarm response' })).toBe('device-smoke');
    expect(routineArtwork({ name: 'Night energy savings', when: 'Sunset' })).toBe('mood-night');
    expect(routineArtwork({ name: 'Water the garden', then: 'Run irrigation' })).toBe('device-sprinkler');
    expect(routineArtwork({ name: 'Custom', schedule: true })).toBe('mood-morning');
    expect(routineArtwork({ name: 'Custom' })).toBe('device-generic');
  });

  it('returns local neutral artwork for unknown identities instead of interpreting them as URLs', () => {
    expect(deviceArtwork({ kind: 'https://invalid.test/private' })).toBe('device-generic');
    expect(roomArtwork({ id: '../../unknown', name: 'New space' })).toBe('room-living');
    for (const identity of ['__proto__', 'constructor', 'toString']) {
      expect(deviceArtwork({ kind: identity })).toBe('device-generic');
      expect(roomArtwork({ id: identity })).toBe('room-living');
      expect(sceneArtwork({ name: 'Custom scene', modelPreset: identity })).toBe('room-living');
    }
  });
});
