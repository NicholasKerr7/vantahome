import type { DeviceDefinition } from './data';
import { readDeviceSetting } from './deviceCapabilities';
import type { DeviceState } from './simulationTypes';

export { TV_SOURCE_OPTIONS } from './deviceControlCatalog';

const REMOTE_ACTIONS = {
  up: 'tv-remote-up',
  down: 'tv-remote-down',
  left: 'tv-remote-left',
  right: 'tv-remote-right',
  select: 'tv-remote-select',
  home: 'tv-remote-home',
  back: 'tv-remote-back',
  playPause: 'tv-play-pause',
  rewind: 'tv-rewind',
  forward: 'tv-forward',
  previous: 'tv-previous',
  next: 'tv-next',
  channelUp: 'tv-channel-up',
  channelDown: 'tv-channel-down',
  volumeUp: 'tv-volume-up',
  volumeDown: 'tv-volume-down',
} as const;

export type TvRemoteKey = keyof typeof REMOTE_ACTIONS;

export interface TvRemoteState {
  on: boolean;
  volume: number;
  muted: boolean;
  channel: number;
  source: string;
  playing: boolean;
  positionSec: number;
  track: number;
  focus: number;
  selection: number;
}

/** Map remote buttons to the same allowlisted actions on native and web surfaces. */
export function tvRemoteActionId(key: TvRemoteKey): typeof REMOTE_ACTIONS[TvRemoteKey] {
  return REMOTE_ACTIONS[key];
}

/** Read canonical defaults and saved preview state without owning a store or transport. */
export function readTvRemoteState(device: DeviceDefinition, state: DeviceState): TvRemoteState {
  return {
    on: state.on,
    volume: Number(readDeviceSetting(device, state, 'volume')),
    muted: Boolean(readDeviceSetting(device, state, 'muted')),
    channel: Number(readDeviceSetting(device, state, 'channel')),
    source: String(readDeviceSetting(device, state, 'source')),
    playing: state.on && readDeviceSetting(device, state, 'playbackState') === 'playing',
    positionSec: Number(readDeviceSetting(device, state, 'playbackPositionSec')),
    track: Number(readDeviceSetting(device, state, 'trackIndex')),
    focus: Number(readDeviceSetting(device, state, 'remoteFocus')),
    selection: Number(readDeviceSetting(device, state, 'remoteSelection')),
  };
}
