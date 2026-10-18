import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Ellipsis, FastForward, Home, ListVideo, Minus, Pause, Play, Plus, Power, Rewind, SkipBack, SkipForward, VolumeX } from 'lucide-react';
import type { DeviceDefinition } from './data';
import { deviceActionFeedback } from './deviceCapabilities';
import { PagedDeviceControls } from './PagedDeviceControls';
import { canControlSceneDevice } from './sceneAccess';
import { useHomeStore, type DeviceState } from './state';
import { readTvRemoteState, TV_SOURCE_OPTIONS, tvRemoteActionId, type TvRemoteKey } from './tvRemote';
import './tv-remote.css';

interface RemoteKeyProps {
  label: string;
  children: ReactNode;
  onPress: () => void;
  className?: string;
  disabled?: boolean;
  pressed?: boolean;
}

/** Keep the sculpted keys ordinary accessible buttons with a single activation. */
function RemoteKey({ label, children, onPress, className = '', disabled = false, pressed }: RemoteKeyProps) {
  return <button type="button" className={`tv-remote-key ${className}`} aria-label={label} title={label}
    disabled={disabled} aria-pressed={pressed} onClick={onPress}>{children}</button>;
}

/** Render a tactile remote over the existing permission-scoped, persisted simulation. */
export function TvRemoteControl({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const modeChanged = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const sourceId = useId();
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const motionDisabled = useHomeStore((state) => state.motionDisabled);
  const tv = readTvRemoteState(device, current);

  /** Focus the new mode's return control without stealing the sheet's initial focus. */
  useLayoutEffect(() => {
    if (modeChanged.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true });
  }, [more]);

  /** Uncommon settings stay available without paging through everyday remote keys. */
  function changeMode(next: boolean) {
    modeChanged.current = true;
    setMore(next);
  }

  /** Relative commands resolve against the store's latest state, including rapid taps. */
  function send(key: TvRemoteKey) {
    useHomeStore.getState().runDeviceAction(device.id, tvRemoteActionId(key));
  }

  /** Read mute at activation time so successive taps never reuse a stale render. */
  function toggleMute() {
    const store = useHomeStore.getState();
    const latest = store.deviceStates[device.id];
    if (latest) store.setDeviceSetting(device.id, 'muted', !readTvRemoteState(device, latest).muted);
  }

  if (more) return <section className="tv-remote-more" aria-label="Additional TV settings">
    <button ref={backButton} type="button" className="tv-remote-return" onClick={() => changeMode(false)}><ArrowLeft size={17} aria-hidden="true" />Back to remote</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;

  return <section className="tv-remote-workspace" aria-label={`${device.name} remote`} data-motion-disabled={motionDisabled}>
    <div className="tv-remote-stage">
      <div className="tv-remote-body" data-powered={tv.on}>
        <div className="tv-remote-top">
          <button type="button" className="tv-remote-key tv-remote-power" role="switch" aria-checked={tv.on}
            aria-label={`${device.name} power`} title="Power" disabled={!controllable} onClick={() => useHomeStore.getState().toggleDevice(device.id)}><Power size={21} aria-hidden="true" /></button>
          <div className="tv-remote-source">
            <label htmlFor={sourceId}>SOURCE <span aria-hidden="true">⌄</span></label>
            <select id={sourceId} aria-label="TV preview source" value={tv.source} disabled={!controllable}
              onChange={(event) => useHomeStore.getState().setDeviceSetting(device.id, 'source', event.currentTarget.value)}>
              {TV_SOURCE_OPTIONS.map((source) => <option key={source} value={source}>{source}</option>)}
            </select>
          </div>
          <button ref={moreButton} type="button" className="tv-remote-key tv-remote-more-key" aria-label="More TV settings" title="More TV settings" onClick={() => changeMode(true)}><Ellipsis size={22} aria-hidden="true" /></button>
        </div>
        <div className="tv-remote-pad" role="group" aria-label="TV navigation">
          <RemoteKey label="TV up" className="tv-remote-up" disabled={!controllable} onPress={() => send('up')}><ChevronUp aria-hidden="true" /></RemoteKey>
          <RemoteKey label="TV left" className="tv-remote-left" disabled={!controllable} onPress={() => send('left')}><ChevronLeft aria-hidden="true" /></RemoteKey>
          <RemoteKey label="TV OK" className="tv-remote-ok" disabled={!controllable} onPress={() => send('select')}>OK</RemoteKey>
          <RemoteKey label="TV right" className="tv-remote-right" disabled={!controllable} onPress={() => send('right')}><ChevronRight aria-hidden="true" /></RemoteKey>
          <RemoteKey label="TV down" className="tv-remote-down" disabled={!controllable} onPress={() => send('down')}><ChevronDown aria-hidden="true" /></RemoteKey>
        </div>
        <div className="tv-remote-navigation" role="group" aria-label="TV shortcuts">
          <RemoteKey label="TV back" disabled={!controllable} onPress={() => send('back')}><ArrowLeft size={18} aria-hidden="true" /><span>Back</span></RemoteKey>
          <RemoteKey label="TV home" disabled={!controllable} onPress={() => send('home')}><Home size={18} aria-hidden="true" /><span>Home</span></RemoteKey>
          <RemoteKey label="TV guide" disabled={!controllable} onPress={() => useHomeStore.getState().runDeviceAction(device.id, 'tv-source-guide')}><ListVideo size={18} aria-hidden="true" /><span>Guide</span></RemoteKey>
        </div>
        <div className="tv-remote-rockers">
          <div className="tv-remote-rocker" role="group" aria-label="TV volume">
            <RemoteKey label="Volume up" disabled={!controllable || tv.volume >= 100} onPress={() => send('volumeUp')}><Plus size={20} aria-hidden="true" /></RemoteKey>
            <div className="tv-remote-rocker-label">VOL <output aria-label="TV volume">{tv.volume}</output></div>
            <RemoteKey label="Volume down" disabled={!controllable || tv.volume <= 0} onPress={() => send('volumeDown')}><Minus size={20} aria-hidden="true" /></RemoteKey>
          </div>
          <div className="tv-remote-center-keys">
            <RemoteKey label={tv.muted ? 'Unmute TV' : 'Mute TV'} pressed={tv.muted} disabled={!controllable} onPress={toggleMute}><VolumeX size={20} aria-hidden="true" /><span>Mute</span></RemoteKey>
            <RemoteKey label={tv.playing ? 'Pause TV preview' : 'Play TV preview'} disabled={!controllable} onPress={() => send('playPause')}>{tv.playing ? <Pause size={21} aria-hidden="true" /> : <Play size={21} aria-hidden="true" />}<span>{tv.playing ? 'Pause' : 'Play'}</span></RemoteKey>
          </div>
          <div className="tv-remote-rocker" role="group" aria-label="TV channel">
            <RemoteKey label="Channel up" disabled={!controllable || tv.channel >= 999} onPress={() => send('channelUp')}><Plus size={20} aria-hidden="true" /></RemoteKey>
            <div className="tv-remote-rocker-label">CH <output aria-label="TV channel">{tv.channel}</output></div>
            <RemoteKey label="Channel down" disabled={!controllable || tv.channel <= 1} onPress={() => send('channelDown')}><Minus size={20} aria-hidden="true" /></RemoteKey>
          </div>
        </div>
        <div className="tv-remote-transport" role="group" aria-label="TV playback">
          <RemoteKey label="Previous preview track" disabled={!controllable} onPress={() => send('previous')}><SkipBack size={18} aria-hidden="true" /></RemoteKey>
          <RemoteKey label="Rewind preview 10 seconds" disabled={!controllable} onPress={() => send('rewind')}><Rewind size={18} aria-hidden="true" /><span>10s</span></RemoteKey>
          <RemoteKey label="Forward preview 10 seconds" disabled={!controllable} onPress={() => send('forward')}><FastForward size={18} aria-hidden="true" /><span>10s</span></RemoteKey>
          <RemoteKey label="Next preview track" disabled={!controllable} onPress={() => send('next')}><SkipForward size={18} aria-hidden="true" /></RemoteKey>
        </div>
        <p className="tv-remote-signature" aria-hidden="true">VANTA<span>HOME</span></p>
      </div>
    </div>
    <div className="tv-remote-feedback" aria-live="polite" aria-atomic="true"><span className="tv-remote-simulation">SIMULATION</span><p>{tv.on ? deviceActionFeedback(device, current) ?? `${tv.muted ? 'Muted' : `Volume ${tv.volume}`} · ${tv.playing ? 'Playing preview' : 'Ready'}` : 'TV is off · Power to begin'}</p></div>
  </section>;
}
