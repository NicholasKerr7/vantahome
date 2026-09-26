import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { DeviceControlCard } from './DeviceControlCard';
import { getDevice, getRoom, type DeviceId } from './data';
import './device-control-sheet.css';

/** Keep full controls within thumb reach while preserving the house and its camera. */
export function DeviceControlSheet({ deviceId, onClose }: { deviceId: DeviceId; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const device = getDevice(deviceId)!;

  // Release native modality during the commit, before the parent restores focus.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    document.documentElement.classList.add('device-sheet-open');
    document.getElementById('sheet-device-control-title')?.focus({ preventScroll: true });
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

  /** Wrap both keyboard directions explicitly, including the initial title focus. */
  function trapFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary'));
    const visibleControls = controls.filter((control) => control.getClientRects().length > 0);
    const first = visibleControls[0];
    const last = visibleControls.at(-1);
    if (!first || !last) return;
    const active = document.activeElement;
    const isControl = visibleControls.some((control) => control === active);
    if (event.shiftKey && (active === first || !isControl)) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (active === last || !isControl)) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  return <dialog ref={dialog} id="full-device-controls" className="device-control-sheet" aria-labelledby="sheet-device-control-title" onKeyDown={trapFocus} onCancel={(event) => { event.preventDefault(); dismiss(); }} onClick={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
    <div className="device-sheet-content">
      <div className="device-sheet-handle" aria-hidden="true" />
      <header className="device-sheet-heading"><div><span className="eyebrow">FULL CONTROLS</span><p>{getRoom(device.roomId).name}</p></div><button type="button" className="quick-device-close" aria-label="Close full controls" onClick={dismiss}><X size={20} aria-hidden="true" /></button></header>
      <DeviceControlCard deviceId={deviceId} inSheet />
      <p className="device-sheet-note">Changes appear in your home. Close to keep exploring.</p>
    </div>
  </dialog>;
}
