import { useEffect, useRef } from 'react';
import { ArrowUpRight, Power, X } from 'lucide-react';
import { formatDeviceLevel, getDevice, getRoom, isPositionDevice, type DeviceId } from './data';
import { deviceStatus, hasLegacyLevel, isMonitor, quickActionLabel, readDeviceSetting } from './deviceCapabilities';
import { gasStatusTone } from './gasSimulation';
import { useHomeStore } from './state';
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
  const isCover = isPositionDevice(device);
  const actionLabel = quickActionLabel(device, current);
  const isSwitch = !isCover && !isMonitor(device.kind) && !['door', 'camera', 'coffee', 'vacuum', 'washer', 'dryer', 'dishwasher', 'microwave', 'generator'].includes(device.kind);
  const actionAriaLabel = isCover ? `${current.level > 0 ? 'Close' : 'Open'} smart ${device.kind === 'garage' ? 'shutter' : device.kind}` : isSwitch ? `${device.name} quick power` : `${actionLabel} ${device.name}`;

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

  return <section ref={panel} id="quick-device-controls" className="quick-device-controls" data-device-tone={gasStatusTone(device.kind, current)} role="dialog" aria-labelledby="quick-device-title" aria-describedby="quick-device-state">
    <div className="quick-device-heading">
      <div><p className="quick-device-room">{getRoom(device.roomId).name}</p><h2 id="quick-device-title">{device.name}</h2></div>
      <button type="button" className="quick-device-close" aria-label="Close quick controls" onClick={() => onClose()}><X size={18} aria-hidden="true" /></button>
    </div>
    <p id="quick-device-state" className={`quick-device-state ${current.on ? 'is-on' : ''}`} aria-live="polite"><span aria-hidden="true" />{deviceStatus(device, current)}<span className="quick-device-value">{hasLegacyLevel(device) && !isCover ? device.kind === 'ac' ? `${readDeviceSetting(device, current, 'tempC')}°C` : formatDeviceLevel(device, current.level) : isMonitor(device.kind) ? 'Demo readings' : ''}</span></p>
    <div className="quick-device-actions">
      <button ref={power} type="button" className="quick-device-toggle" role={isSwitch ? 'switch' : undefined} aria-checked={isSwitch ? current.on : undefined} aria-label={actionAriaLabel} onClick={() => toggleDevice(deviceId)}><Power size={17} aria-hidden="true" /><span>{actionLabel}</span>{isSwitch ? <span className="quick-device-switch" aria-hidden="true"><span /></span> : null}</button>
      <button type="button" className="quick-device-full" onClick={() => onFullControls(deviceId)}>Full controls<ArrowUpRight size={16} aria-hidden="true" /></button>
    </div>
  </section>;
}
