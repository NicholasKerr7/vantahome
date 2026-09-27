import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { Power, X } from 'lucide-react';
import { DEVICE_ICONS } from './DeviceControlCard';
import { PagedDeviceControls } from './PagedDeviceControls';
import { deviceActionFeedback, deviceStatus, quickActionLabel } from './deviceCapabilities';
import { getDevice, getRoom, type DeviceId } from './data';
import { useHomeStore } from './state';
import './device-control-sheet.css';

/** Keep complete device controls in one screen without moving the home or its camera. */
export function DeviceControlSheet({ deviceId, onClose }: { deviceId: DeviceId; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const device = getDevice(deviceId)!;
  const current = useHomeStore((state) => state.deviceStates[deviceId]);
  const toggleDevice = useHomeStore((state) => state.toggleDevice);
  const Icon = DEVICE_ICONS[device.kind];

  // Release native modality during the commit, before the parent restores focus.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    document.documentElement.classList.add('device-sheet-open');
    title.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      document.documentElement.classList.remove('device-sheet-open');
    };
  }, []);

  /** Close the native dialog before focusing an element in the background scene. */
  function dismiss() {
    dialog.current?.close();
    onClose();
  }

  /** Wrap keyboard focus without intercepting ordinary movement inside a control. */
  function trapFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled)'));
    const visibleControls = controls.filter((control) => control.getClientRects().length > 0);
    const first = visibleControls[0];
    const last = visibleControls.at(-1);
    if (!first || !last) return;
    const active = document.activeElement;
    const initialFocus = active === title.current || active === dialog.current;
    if (event.shiftKey && (active === first || initialFocus)) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (active === last || initialFocus)) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  return <dialog ref={dialog} id="full-device-controls" className="device-control-sheet" aria-labelledby="sheet-device-control-title" onKeyDown={trapFocus} onCancel={(event) => { event.preventDefault(); dismiss(); }} onClick={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
    <div className="device-sheet-content">
      <header className="device-sheet-heading">
        <span className={`device-sheet-icon ${current.on ? 'is-on' : ''}`}><Icon size={24} strokeWidth={1.5} aria-hidden="true" /></span>
        <div className="device-sheet-identity">
          <p className="device-sheet-location">{getRoom(device.roomId).name}<span aria-hidden="true"> · </span>Full controls</p>
          <h2 id="sheet-device-control-title" ref={title} tabIndex={-1}>{device.name}</h2>
          <p className="device-sheet-state" aria-live="polite"><span className={current.on ? 'is-on' : ''} aria-hidden="true" />{deviceActionFeedback(device, current) ?? deviceStatus(device, current)}</p>
        </div>
        <button type="button" className="quick-device-close" aria-label="Close full controls" onClick={dismiss}><X size={20} aria-hidden="true" /></button>
      </header>
      <button type="button" className="device-sheet-primary" onClick={() => toggleDevice(deviceId)}><Power size={17} aria-hidden="true" /><span>{quickActionLabel(device, current)}</span></button>
      <PagedDeviceControls key={deviceId} device={device} current={current} />
    </div>
  </dialog>;
}
