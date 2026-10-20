import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Ellipsis, Minus, Pause, Play, Plus, Power, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { SPEAKER_PRESET_OPTIONS, SPEAKER_SOURCE_OPTIONS, readSpeakerControllerState, speakerControllerActionId } from './speakerController';
import { SpeakerConsoleArtwork } from './SpeakerConsoleArtwork';
import './speaker-controller.css';

/** A sculpted audio console uses existing saved controls without opening an audio stream. */
export function SpeakerController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const sourceId = useId();
  const presetId = useId();
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const motionDisabled = useHomeStore((state) => state.motionDisabled);
  const speaker = readSpeakerControllerState(device, current);

  /** Preserve initial dialog focus and restore the matching control after More/Back. */
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);

  /** Keep every advanced control reachable without crowding the everyday console. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }

  /** Relative commands resolve against the latest guarded store state, including rapid taps. */
  function run(key: Parameters<typeof speakerControllerActionId>[0]) { useHomeStore.getState().runDeviceAction(device.id, speakerControllerActionId(key)); }

  /** Muting never changes volume, playback or power; successive presses read current state. */
  function toggleMute() {
    const store = useHomeStore.getState();
    const latest = store.deviceStates[device.id];
    const value = latest && readSpeakerControllerState(device, latest);
    if (value) store.setDeviceSetting(device.id, 'muted', !value.muted);
  }

  if (!speaker) return null;
  if (more) return <section className="speaker-more" aria-label="Additional speaker settings">
    <button ref={backButton} type="button" className="speaker-return" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to audio console</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;
  const active = speaker.playing && !speaker.muted && speaker.volume > 0;

  return <section className="speaker-workspace" aria-label={`${device.name} audio console`} data-motion-disabled={motionDisabled}>
    <div className="speaker-stage"><div className="speaker-console" data-active={active}>
      <header className="speaker-top">
        <button type="button" className="speaker-round" role="switch" aria-label="Speaker power" aria-checked={speaker.on} disabled={!controllable} onClick={() => useHomeStore.getState().toggleDevice(device.id)}><Power size={21} aria-hidden="true" /></button>
        <div className="speaker-brand"><span>VANTAHOME</span><strong>AUDIO</strong></div>
        <button ref={moreButton} type="button" className="speaker-round" aria-label="More speaker settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <div className="speaker-visual">
        <SpeakerConsoleArtwork active={active} />
        <div className="speaker-readings"><span>LOCAL PLAYBACK</span><strong>{speaker.status}</strong><small>{speaker.trackIndex === null ? 'Preview track unavailable' : `Preview track ${String(speaker.trackIndex).padStart(2, '0')}`}</small></div>
      </div>
      <div className="speaker-transport" role="group" aria-label="Speaker playback preview">
        <button type="button" aria-label="Previous speaker preview track" disabled={!controllable || speaker.trackIndex === null || speaker.trackIndex === 1} onClick={() => run('previous')}><SkipBack size={20} aria-hidden="true" /></button>
        <button type="button" className="speaker-play" aria-label={speaker.playing ? 'Pause speaker preview' : 'Play speaker preview'} disabled={!controllable} onClick={() => run('playPause')}>{speaker.playing ? <Pause size={24} aria-hidden="true" /> : <Play size={24} aria-hidden="true" />}<span>{speaker.playing ? 'Pause' : 'Play'}</span></button>
        <button type="button" aria-label="Next speaker preview track" disabled={!controllable || speaker.trackIndex === null || speaker.trackIndex === 99} onClick={() => run('next')}><SkipForward size={20} aria-hidden="true" /></button>
      </div>
      <div className="speaker-volume-row">
        <div className="speaker-volume" role="group" aria-label="Speaker volume, steps of 5 percent">
          <button type="button" className="speaker-round" aria-label="Decrease speaker volume" disabled={!controllable || speaker.volume <= 0} onClick={() => run('volumeDown')}><Minus size={20} aria-hidden="true" /></button>
          <div><span>VOLUME</span><output aria-label="Speaker volume in percent" aria-live="off">{speaker.volume}<small>%</small></output></div>
          <button type="button" className="speaker-round" aria-label="Increase speaker volume" disabled={!controllable || speaker.volume >= 100} onClick={() => run('volumeUp')}><Plus size={20} aria-hidden="true" /></button>
        </div>
        <button type="button" className="speaker-mute" role="switch" aria-label="Mute speaker" aria-checked={speaker.muted} disabled={!controllable} onClick={toggleMute}>{speaker.muted ? <VolumeX size={20} aria-hidden="true" /> : <Volume2 size={20} aria-hidden="true" />}<span>{speaker.muted ? 'Muted' : 'Mute'}</span></button>
      </div>
      <div className="speaker-preferences">
        <div><label htmlFor={sourceId}>SOURCE PREFERENCE</label><div className="speaker-select"><select id={sourceId} aria-label="Speaker source preference" value={speaker.source} disabled={!controllable} onChange={(event) => useHomeStore.getState().setDeviceSetting(device.id, 'speakerSource', event.currentTarget.value)}>{SPEAKER_SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></div></div>
        <div><label htmlFor={presetId}>SOUND PREFERENCE</label><div className="speaker-select"><select id={presetId} aria-label="Speaker sound preference" value={speaker.preset} disabled={!controllable} onChange={(event) => useHomeStore.getState().setDeviceSetting(device.id, 'speakerPreset', event.currentTarget.value)}>{SPEAKER_PRESET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></div></div>
      </div>
      <p className="speaker-note">Source and sound are saved preferences.</p>
    </div></div>
    <p className="speaker-feedback"><span>SIMULATION</span>Local playback preview · No audio stream</p>
  </section>;
}
