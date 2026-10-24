import { isEmbeddedScene } from './embeddedHost';
import { requestCameraWatch } from './requestCameraWatch';
import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, Camera, Ellipsis, Moon, ShieldCheck, ShieldOff, Video } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { getCameraConsolePresentation, cameraControllerActionId } from './cameraController';
import { PagedDeviceControls } from './PagedDeviceControls';
import { CameraConsoleArtwork } from './CameraConsoleArtwork';
import { useOpeningPresentationMotion } from './useOpeningPresentationMotion';
import './camera-controller.css';

/** A local camera console keeps arming, saved preferences and illustrative previews distinct. */
export function CameraController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const reduced = useHomeStore((state) => state.motionDisabled);
  const motionAllowed = useOpeningPresentationMotion(reduced);
  const camera = getCameraConsolePresentation(device, current);
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);

  /** Return focus to the initiating key while retaining every advanced camera setting. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }
  /** Read the newest accepted preference before a guarded toggle, including consecutive taps. */
  function togglePreference(field: 'nightVision' | 'motionAlerts') {
    const store = useHomeStore.getState();
    const latest = store.deviceStates[device.id];
    const presentation = latest && getCameraConsolePresentation(device, latest);
    if (presentation) store.setDeviceSetting(device.id, field, !presentation[field]);
  }
  if (!camera) return null;
  if (more) return <section className="camera-more" aria-label="Additional camera settings">
    <button ref={backButton} type="button" className="camera-return" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to camera console</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;
  const Shield = camera.armed ? ShieldCheck : ShieldOff;
  return <section className="camera-workspace" aria-label={`${device.name} camera console`} data-motion-disabled={!motionAllowed} data-camera-watch={isEmbeddedScene()}>
    <div className="camera-stage"><div className="camera-console">
      <header className="camera-top">
        <span className="camera-emblem" aria-hidden="true"><Video size={23} /></span>
        <div className="camera-brand"><span>VANTAHOME</span><strong>VISION</strong></div>
        <button ref={moreButton} type="button" className="camera-round" aria-label="More camera settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <div className="camera-monitor">
        <CameraConsoleArtwork nightVision={camera.nightVision} />
        <div className="camera-monitor-top"><span className="camera-sample">SAMPLE PREVIEW</span><span>ILLUSTRATION</span></div>
        <div className="camera-reticle" aria-hidden="true" />
        <div className="camera-monitor-caption"><span>ARCHITECTURAL STUDY</span><strong>A quiet perspective.</strong></div>
      </div>
      <div className="camera-arm-row">
        <div className="camera-status"><Shield size={20} aria-hidden="true" /><div><strong>{camera.status}</strong><span>Local simulation</span></div></div>
        <button type="button" className="camera-arm" aria-label="Camera armed" aria-pressed={camera.armed} disabled={!controllable} onClick={() => useHomeStore.getState().toggleDevice(device.id)}>{camera.armed ? 'Disarm' : 'Arm'}</button>
      </div>
      {isEmbeddedScene() && <button type="button" className="camera-watch" aria-label="Watch camera demo preview" onClick={() => requestCameraWatch(device.id)}><Video size={18} aria-hidden="true" />Watch</button>}
      <div className="camera-preferences" role="group" aria-label="Saved camera preferences">
        <button type="button" aria-label="Night vision preference" aria-pressed={camera.nightVision} disabled={!controllable} onClick={() => togglePreference('nightVision')}><Moon size={18} aria-hidden="true" /><span>Night<small>{camera.nightVision ? 'On' : 'Off'}</small></span></button>
        <button type="button" aria-label="Motion alerts preference" aria-pressed={camera.motionAlerts} disabled={!controllable} onClick={() => togglePreference('motionAlerts')}><Bell size={18} aria-hidden="true" /><span>Alerts<small>{camera.motionAlerts ? 'On' : 'Off'}</small></span></button>
        <button type="button" className="camera-capture" aria-label="Simulate snapshot" disabled={!controllable} onClick={() => useHomeStore.getState().runDeviceAction(device.id, cameraControllerActionId('snapshot'))}><Camera size={18} aria-hidden="true" /><span>Snapshot<small>Simulate</small></span></button>
      </div>
      <div className="camera-event" aria-live="polite"><span>LOCAL PREVIEW EVENT</span><strong>{camera.previewEvent.label}</strong></div>
      <div className="camera-trim" aria-hidden="true"><span /><span /><span /></div>
    </div></div>
    <p className="camera-feedback"><span>SIMULATION · NO LIVE FEED CONNECTED</span>Preferences saved locally · No video or audio captured</p>
  </section>;
}
