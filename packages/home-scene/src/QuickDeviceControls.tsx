import { canViewSceneDevice, canControlSceneDevice } from './sceneAccess';
import { useEffect, useRef } from 'react';
import { ArrowUpRight, Power, X } from 'lucide-react';
import { getDevice, getRoom, type DeviceId } from './data';
import { deviceActionFeedback, deviceStatus, isMonitor } from './deviceCapabilities';
import { DEVICE_ICONS } from './DeviceControlCard';
import { PrimaryDeviceRange } from './PrimaryDeviceRange';
import { primaryDeviceAction, primaryDeviceRange } from './quickDevicePresentation';
import { hotspotPresentation } from './hotspotPresentation';
import { useHomeStore } from './state';
import { CinematicArtwork } from './CinematicCardArtwork';
import { deviceArtwork } from './cinematicArtwork';
import './quick-device-controls.css';

interface QuickDeviceControlsProps {
  deviceId: DeviceId;
  onClose: (restoreFocus?: boolean) => void;
  onFullControls: (id: DeviceId) => void;
}

/** Keep immediate device actions beside the house without moving the camera. */
export function QuickDeviceControls({ deviceId, onClose, onFullControls }: QuickDeviceControlsProps) {
  const panel = useRef<HTMLElement>(null);
  const power = useRef<HTMLButtonElement>(null);
  const current = useHomeStore((state) => state.deviceStates[deviceId]);
  const toggleDevice = useHomeStore((state) => state.toggleDevice);
  const device = getDevice(deviceId)!;
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, deviceId));
  const visible = useHomeStore((state) => canViewSceneDevice(state.access, deviceId));
  const action = primaryDeviceAction(device, current);
  const range = primaryDeviceRange(device, current);
  const Icon = DEVICE_ICONS[device.kind];
  const ActionIcon = action.isSwitch ? Power : Icon;
  const presentation = hotspotPresentation(device, current);

  useEffect(() => {
    // Focusing a button does not summon a mobile keyboard or scroll the house away.
    power.current?.focus({ preventScroll: true });

    /** Dismiss outside taps, while allowing another hotspot to replace this panel. */
    function dismissOutside(event: PointerEvent) {
      if (!(event.target instanceof Element)) return;
      if (panel.current?.contains(event.target) || event.target.closest('[data-device-hotspot]')) return;
      onClose(false);
    }

    /** Escape returns keyboard focus to the hotspot that opened quick controls. */
    function dismissWithEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    }

    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('keydown', dismissWithEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('keydown', dismissWithEscape);
    };
  }, [deviceId, onClose]);

  if (!visible) return null;
  return <section ref={panel} id="quick-device-controls" className={`quick-device-controls ${range ? 'has-primary-range' : ''}`} data-device-active={presentation.active} data-device-monitoring={presentation.monitoring} data-device-tone={presentation.tone} role="dialog" aria-labelledby="quick-device-title" aria-describedby="quick-device-state">
    <div className="quick-device-heading has-cinematic-artwork">
      <CinematicArtwork artwork={deviceArtwork(device)} presentation="identity" />
      <span className="quick-device-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.5} /></span>
      <div className="quick-device-identity"><p className="quick-device-room">{getRoom(device.roomId).name}</p><h2 id="quick-device-title">{device.name}</h2></div>
      <button type="button" className="quick-device-close" aria-label="Close quick controls" onClick={() => onClose()}><X size={18} aria-hidden="true" /></button>
    </div>
    <p id="quick-device-state" className={`quick-device-state ${presentation.active ? 'is-on' : ''}`} aria-live="polite"><span aria-hidden="true" />{deviceActionFeedback(device, current) ?? deviceStatus(device, current)}<span className="quick-device-value">{range?.text ?? (isMonitor(device.kind) ? 'Demo readings' : '')}</span></p>
    {controllable ? <PrimaryDeviceRange device={device} current={current} location="quick" /> : <p className="device-hint">View only</p>}
    <div className="quick-device-actions">
      <button ref={power} type="button" className="quick-device-toggle" disabled={!controllable} role={action.isSwitch ? 'switch' : undefined} aria-checked={action.isSwitch ? current.on : undefined} aria-label={action.accessibleLabel} onClick={() => toggleDevice(deviceId)}><ActionIcon size={17} aria-hidden="true" /><span>{action.label}</span>{action.isSwitch ? <span className="quick-device-switch" aria-hidden="true"><span /></span> : null}</button>
      <button type="button" className="quick-device-full" onClick={() => onFullControls(deviceId)}>Full controls<ArrowUpRight size={16} aria-hidden="true" /></button>
    </div>
  </section>;
}
