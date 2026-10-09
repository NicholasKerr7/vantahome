import type { DeviceDefinition } from '../data';
import { readDeviceSetting } from '../deviceCapabilities';
import type { DeviceState } from '../simulationTypes';

/** Sound rings describe playing, audible preview media rather than mere speaker power. */
export function speakerPlaybackVisible(device: DeviceDefinition, state: DeviceState): boolean {
  return device.kind === 'speaker' && state.on &&
    readDeviceSetting(device, state, 'muted') !== true &&
    Number(readDeviceSetting(device, state, 'volume')) > 0 &&
    readDeviceSetting(device, state, 'playbackState') === 'playing';
}
