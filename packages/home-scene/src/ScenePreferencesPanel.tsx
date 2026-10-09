import { Clapperboard, CloudSun, Pause, Play, RotateCcw } from 'lucide-react';
import { DEVICES } from './data';
import { isEmbeddedScene } from './embeddedHost';
import type { LiveEnvironment } from './environment/types';
import { useCinematicStore } from './cinematicStore';
import { useHomeStore } from './state';

type Props = { environment: LiveEnvironment; reducedMotion: boolean; systemReducedMotion: boolean; onClose: () => void; onEnvironment: () => void };

/** Keep reset/help reachable from Account while standalone authoring retains its local preferences. */
export function ScenePreferencesPanel({ environment, reducedMotion, systemReducedMotion, onClose, onEnvironment }: Props) {
  const embedded = isEmbeddedScene();
  const setMotionDisabled = useHomeStore(state => state.setMotionDisabled);
  const idleEnabled = useCinematicStore(state => state.idleEnabled);
  const setIdleEnabled = useCinematicStore(state => state.setIdleEnabled);
  const preferenceError = useCinematicStore(state => state.preferenceError);
  const reset = useHomeStore(state => state.reset);
  const access = useHomeStore(state => state.access);
  return <div className="dashboard-preferences">
    <p>Explore the house, tap a device, and make it yours. This is a local simulation; no real hardware is connected.</p>
    {!embedded && <>
      <button className="dashboard-preference" disabled={systemReducedMotion} aria-pressed={reducedMotion} onClick={() => setMotionDisabled(!reducedMotion)}>
        {reducedMotion ? <Pause size={20} /> : <Play size={20} />}<span>{systemReducedMotion ? 'Reduced motion · system' : reducedMotion ? 'Motion paused' : 'Motion on'}<small>Camera movement and animated devices</small></span>
      </button>
      <button className="dashboard-preference" aria-pressed={idleEnabled} aria-label="Automatic property tour" onClick={() => setIdleEnabled(!idleEnabled)}>
        <Clapperboard size={20} aria-hidden="true" /><span>Automatic property tour · {idleEnabled ? 'On' : 'Off'}<small>{reducedMotion ? 'Paused by your motion preference' : 'After 90 seconds of inactivity · touch to return'}</small></span>
      </button>
      {preferenceError && <p role="status">Your tour preference could not be saved. This choice lasts for this session.</p>}
    </>}
    <button className="dashboard-preference" disabled={!access.fullHome || access.controllableDeviceIds.length !== DEVICES.length} aria-label="Reset simulation to Morning" onClick={() => { reset(environment.isNight); onClose(); }}>
      <RotateCcw size={20} /><span>Reset your home<small>Reset devices and follow local daylight</small></span>
    </button>
    <button className="dashboard-preference" onClick={onEnvironment}><CloudSun size={20} /><span>Time & weather<small>{environment.location.name} · daylight and regional estimates</small></span></button>
    <p className="dashboard-help-copy">Drag to orbit. Pinch to zoom. Use the view bar to explore the floor plan, landscape or immersive view. {embedded ? 'Changes are saved on this device.' : 'Changes stay in this browser.'}</p>
  </div>;
}
