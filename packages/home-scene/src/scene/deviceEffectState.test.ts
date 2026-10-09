import { describe, expect, it } from 'vitest';
import { DEVICES } from '../data';
import { applyDeviceSetting, runDeviceActionState, toggleDeviceState } from '../deviceControlActions';
import { speakerPlaybackVisible } from './deviceEffectState';

describe('speaker animation follows the real preview controls', () => {
  it.each(DEVICES.filter((device) => device.kind === 'speaker'))('$id stops sound rings when paused, muted, silent or powered off', (device) => {
    const idle = { on: true, level: device.defaultLevel };
    expect(speakerPlaybackVisible(device, idle)).toBe(false);
    const playing = runDeviceActionState(device.id, idle, 'speaker-play-pause');
    expect(speakerPlaybackVisible(device, playing)).toBe(true);
    expect(speakerPlaybackVisible(device, runDeviceActionState(device.id, playing, 'speaker-play-pause'))).toBe(false);
    expect(speakerPlaybackVisible(device, applyDeviceSetting(device.id, playing, 'muted', true))).toBe(false);
    const silent = applyDeviceSetting(device.id, playing, 'volume', 0);
    expect(speakerPlaybackVisible(device, silent)).toBe(false);
    expect(speakerPlaybackVisible(device, applyDeviceSetting(device.id, silent, 'volume', 20))).toBe(true);
    expect(speakerPlaybackVisible(device, toggleDeviceState(device.id, playing))).toBe(false);
  });
});
