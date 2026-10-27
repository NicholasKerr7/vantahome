import { requestCameraWatch } from './requestCameraWatch';
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
import { BlindsController } from './BlindsControlPanel';
import { LightingController } from './LightingControlPanel';
import { EnergyController } from './EnergyControlPanel';
import { isEnergyDeviceKind } from './energyController';
import { GateController } from './GateControlPanel';
import { WaterController } from './WaterControlPanel';
import { VacuumController } from './VacuumControlPanel';
import { SpeakerController } from './SpeakerControlPanel';
import { FanController } from './FanControlPanel';
import { AirQualityController } from './AirQualityControlPanel';
import { IrrigationController } from './IrrigationControlPanel';
import { LaundryController } from './LaundryControlPanel';
import { DishwasherController } from './DishwasherControlPanel';
import { OpeningController } from './OpeningControlPanel';
import { CameraController } from './CameraControlPanel';
import { isOpeningDeviceKind } from './openingController';
import { isLaundryKind } from './laundryActivity';
import { isWaterDeviceKind, readWaterControllerState } from './waterController';
import { GATE_DEVICE_ID } from './gateSafetySimulation';
import { formatClimateTemperature, readClimateControllerState } from './climateController';

type DeviceControlSheetProps = { deviceId: DeviceId; onClose: () => void };
const CONTROLLER_CLASSES: Partial<Record<DeviceDefinition['kind'], string>> = {
  tv: 'is-tv-remote', ac: 'is-climate-controller', blinds: 'is-blinds-controller', light: 'is-lighting-controller',
  energy: 'is-energy-controller', solar: 'is-energy-controller', battery: 'is-energy-controller', generator: 'is-energy-controller',
  gate: 'is-gate-controller',
  water: 'is-water-controller', 'water-heater': 'is-water-controller',
  vacuum: 'is-vacuum-controller',
  speaker: 'is-speaker-controller',
  fan: 'is-fan-controller',
  sprinkler: 'is-irrigation-controller',
  air: 'is-air-quality-controller',
  washer: 'is-laundry-controller', dryer: 'is-laundry-controller',
  dishwasher: 'is-dishwasher-controller',
  camera: 'is-camera-controller',
  door: 'is-opening-controller', garage: 'is-opening-controller', window: 'is-opening-controller',
};

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
  const water = device.kind === 'water-heater' ? readWaterControllerState(device, current) : null;
  const status = water?.kind === 'water-heater'
    ? `${water.on ? 'On' : 'Off'} · Target ${formatClimateTemperature(water.targetC, tempUnit)}°${tempUnit}`
    : device.kind === 'ac'
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

  const controllerClass = controllable ? ` ${CONTROLLER_CLASSES[device.kind] ?? ''}` : '';
  return <dialog ref={dialog} id="full-device-controls" className={`device-control-sheet${controllerClass}`} aria-labelledby="sheet-device-control-title" onKeyDown={trapFocus} onCancel={(event) => { event.preventDefault(); dismiss(); }} onClick={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
    <div className="device-sheet-content">
      <header className="device-sheet-heading" data-device-active={presentation.active} data-device-monitoring={presentation.monitoring} data-device-tone={presentation.tone}>
        <span className={`device-sheet-icon ${presentation.active ? 'is-on' : ''}`}><Icon size={24} strokeWidth={1.5} aria-hidden="true" /></span>
        <div className="device-sheet-identity">
          <p className="device-sheet-location">{getRoom(device.roomId).name}<span aria-hidden="true"> · </span>Full controls</p>
          <h2 id="sheet-device-control-title" ref={title} tabIndex={-1}>{device.name}</h2>
          <p className="device-sheet-state" aria-live="polite"><span className={presentation.active ? 'is-on' : ''} aria-hidden="true" />{status}</p>
        </div>
        {device.kind === 'camera' && !controllable && isEmbeddedScene() && <button type="button" className="quick-device-full" aria-label="Watch camera demo preview" onClick={() => requestCameraWatch(deviceId)}>Watch</button>}
        {editable && isEmbeddedScene() && <button type="button" className="quick-device-close" aria-label="Edit device" title="Edit device"
          onClick={() => { requestDeviceEditing(deviceId); dismiss(); }}><Pencil size={18} aria-hidden="true" /></button>}
        <button type="button" className="quick-device-close" aria-label="Close full controls" onClick={dismiss}><X size={20} aria-hidden="true" /></button>
      </header>
      {device.kind === 'tv' && controllable ? <TvRemoteControl key={deviceId} device={device} current={current} />
        : device.kind === 'ac' && controllable ? <ClimateController key={deviceId} device={device} current={current} />
        : device.kind === 'blinds' && controllable ? <BlindsController key={deviceId} device={device} current={current} />
        : device.kind === 'light' && controllable ? <LightingController key={deviceId} device={device} current={current} />
        : isEnergyDeviceKind(device.kind) && controllable ? <EnergyController key={deviceId} device={device} current={current} />
        : isWaterDeviceKind(device.kind) && controllable ? <WaterController key={deviceId} device={device} current={current} />
        : device.kind === 'vacuum' && controllable ? <VacuumController key={deviceId} device={device} current={current} />
        : device.kind === 'speaker' && controllable ? <SpeakerController key={deviceId} device={device} current={current} />
        : device.kind === 'fan' && controllable ? <FanController key={deviceId} device={device} current={current} />
        : device.kind === 'air' && controllable ? <AirQualityController key={deviceId} device={device} current={current} />
        : device.kind === 'sprinkler' && controllable ? <IrrigationController key={deviceId} device={device} current={current} />
        : isLaundryKind(device.kind) && controllable ? <LaundryController key={deviceId} device={device} current={current} />
        : device.kind === 'dishwasher' && controllable ? <DishwasherController key={deviceId} device={device} current={current} />
        : device.kind === 'camera' && controllable ? <CameraController key={deviceId} device={device} current={current} />
        : isOpeningDeviceKind(device.kind) && controllable ? <OpeningController key={deviceId} device={device} current={current} />
        : device.id === GATE_DEVICE_ID && controllable ? <GateController key={deviceId} device={device} current={current} /> : <>
        <button type="button" className="device-sheet-primary" disabled={!controllable} role={action.isSwitch ? 'switch' : undefined} aria-checked={action.isSwitch ? current.on : undefined} aria-label={action.isSwitch ? `${device.name} power` : action.accessibleLabel} onClick={() => toggleDevice(deviceId)}><ActionIcon size={17} aria-hidden="true" /><span>{action.label}</span></button>
        {controllable ? <PagedDeviceControls key={deviceId} device={device} current={current} /> : <p className="device-hint">View only. Your household role does not allow changing this device.</p>}
      </>}
    </div>
  </dialog>;
}
