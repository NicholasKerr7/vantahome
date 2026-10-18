import { canViewSceneDevice, canControlSceneDevice } from './sceneAccess';
import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { Pencil, Power, X } from 'lucide-react';
import { DEVICE_ICONS } from './DeviceControlCard';
import { PagedDeviceControls } from './PagedDeviceControls';
import { deviceActionFeedback, deviceStatus } from './deviceCapabilities';
import { hotspotPresentation } from './hotspotPresentation';
import { primaryDeviceAction } from './quickDevicePresentation';
import { getDevice, getRoom, type DeviceDefinition, type DeviceId } from './data';
import { useHomeStore, type DeviceState } from './state';
import './device-control-sheet.css';
import { isEmbeddedScene } from './embeddedHost';
import { requestDeviceEditing } from './requestDeviceEditing';
import { TvRemoteControl } from './TvRemoteControl';
import { ClimateController } from './ClimateControlPanel';
import { formatClimateTemperature, readClimateControllerState } from './climateController';

type DeviceControlSheetProps = { deviceId: DeviceId; onClose: () => void };

/** Unmount removed or revoked fixtures before their stale dialog can read deleted catalog data. */
export function DeviceControlSheet({ deviceId, onClose }: DeviceControlSheetProps) {
  const device = useHomeStore((state) => canViewSceneDevice(state.access, deviceId) ? getDevice(deviceId) : undefined);
  const current = useHomeStore((state) => state.deviceStates[deviceId]);
  if (!device || !current) return null;
  return <DeviceControlSheetContents device={device} current={current} onClose={onClose} />;
}

/** Keep complete device controls in one screen without moving the home or its camera. */
function DeviceControlSheetContents({ device, current, onClose }: { device: DeviceDefinition; current: DeviceState; onClose: () => void }) {
  const deviceId = device.id;
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const toggleDevice = useHomeStore((state) => state.toggleDevice);
  const Icon = DEVICE_ICONS[device.kind];
  const presentation = hotspotPresentation(device, current);
  const action = primaryDeviceAction(device, current);
  const ActionIcon = action.isSwitch ? Power : Icon;
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, deviceId));
  const tempUnit = useHomeStore((state) => state.tempUnit);
  const editable = useHomeStore((state) => canViewSceneDevice(state.access, deviceId) && state.access.editableDeviceIds?.includes(deviceId) === true);
  const status = device.kind === 'ac'
    ? `${current.on ? 'On' : 'Off'} · Target ${formatClimateTemperature(readClimateControllerState(device, current).targetC, tempUnit)}°${tempUnit}`
    : deviceActionFeedback(device, current) ?? deviceStatus(device, current);

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

  const controllerClass = controllable ? device.kind === 'tv' ? ' is-tv-remote' : device.kind === 'ac' ? ' is-climate-controller' : '' : '';
  return <dialog ref={dialog} id="full-device-controls" className={`device-control-sheet${controllerClass}`} aria-labelledby="sheet-device-control-title" onKeyDown={trapFocus} onCancel={(event) => { event.preventDefault(); dismiss(); }} onClick={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
    <div className="device-sheet-content">
      <header className="device-sheet-heading" data-device-active={presentation.active} data-device-monitoring={presentation.monitoring} data-device-tone={presentation.tone}>
        <span className={`device-sheet-icon ${presentation.active ? 'is-on' : ''}`}><Icon size={24} strokeWidth={1.5} aria-hidden="true" /></span>
        <div className="device-sheet-identity">
          <p className="device-sheet-location">{getRoom(device.roomId).name}<span aria-hidden="true"> · </span>Full controls</p>
          <h2 id="sheet-device-control-title" ref={title} tabIndex={-1}>{device.name}</h2>
          <p className="device-sheet-state" aria-live="polite"><span className={presentation.active ? 'is-on' : ''} aria-hidden="true" />{status}</p>
        </div>
        {editable && isEmbeddedScene() && <button type="button" className="quick-device-close" aria-label="Edit device" title="Edit device"
          onClick={() => { requestDeviceEditing(deviceId); dismiss(); }}><Pencil size={18} aria-hidden="true" /></button>}
        <button type="button" className="quick-device-close" aria-label="Close full controls" onClick={dismiss}><X size={20} aria-hidden="true" /></button>
      </header>
      {device.kind === 'tv' && controllable ? <TvRemoteControl key={deviceId} device={device} current={current} />
        : device.kind === 'ac' && controllable ? <ClimateController key={deviceId} device={device} current={current} /> : <>
        <button type="button" className="device-sheet-primary" disabled={!controllable} role={action.isSwitch ? 'switch' : undefined} aria-checked={action.isSwitch ? current.on : undefined} aria-label={action.isSwitch ? `${device.name} power` : action.accessibleLabel} onClick={() => toggleDevice(deviceId)}><ActionIcon size={17} aria-hidden="true" /><span>{action.label}</span></button>
        {controllable ? <PagedDeviceControls key={deviceId} device={device} current={current} /> : <p className="device-hint">View only. Your household role does not allow changing this device.</p>}
      </>}
    </div>
  </dialog>;
}
