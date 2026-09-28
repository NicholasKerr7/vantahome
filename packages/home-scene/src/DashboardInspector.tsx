import { useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Grid2X2, type LucideIcon } from 'lucide-react';
import { DEVICES, formatDeviceLevel, getDevice, getRoom, isPositionDevice, type DeviceDefinition, type DeviceId } from './data';
import { DEVICE_ICONS } from './DeviceControlCard';
import { deviceStatus, hasLegacyLevel, isMonitor, quickActionLabel, readDeviceSetting } from './deviceCapabilities';
import { gasStatusTone } from './gasSimulation';
import { useHomeStore } from './state';
import './dashboard-inspector.css';

interface DashboardInspectorProps {
  onFullControls: (id: DeviceId) => void;
  onBrowseDevices: () => void;
}

const DEVICES_PER_PAGE = 3;
const ACTION_DEVICE_KINDS = new Set(['door', 'camera', 'coffee', 'vacuum', 'washer', 'dryer', 'dishwasher', 'microwave', 'generator']);

/** Give the selected device the same kind-aware action used by hotspot controls. */
function SelectedDeviceSummary({ device, onFullControls }: { device: DeviceDefinition; onFullControls: (id: DeviceId) => void }) {
  const storedState = useHomeStore((state) => state.deviceStates[device.id]);
  const toggleDevice = useHomeStore((state) => state.toggleDevice);
  const setDeviceLevel = useHomeStore((state) => state.setDeviceLevel);
  const setDeviceSetting = useHomeStore((state) => state.setDeviceSetting);
  const current = storedState ?? { on: device.defaultOn, level: device.defaultLevel };
  const Icon: LucideIcon = DEVICE_ICONS[device.kind];
  const isCover = isPositionDevice(device);
  const isSwitch = !isCover && !isMonitor(device.kind) && !ACTION_DEVICE_KINDS.has(device.kind);
  const actionLabel = quickActionLabel(device, current);
  const hasPrimaryLevel = hasLegacyLevel(device) || isCover;
  const isTemperature = hasLegacyLevel(device) && device.kind === 'ac';
  const levelValue = isTemperature ? Number(readDeviceSetting(device, current, 'tempC')) : current.level;
  const levelText = isTemperature ? `${levelValue}°C` : formatDeviceLevel(device, current.level);
  const rangeId = `dashboard-level-${device.id}`;
  const actionAriaLabel = isCover
    ? `${current.level > 0 ? 'Close' : 'Open'} smart ${device.kind === 'garage' ? 'shutter' : device.kind}`
    : isSwitch ? `${device.name} quick power` : `${actionLabel} ${device.name}`;

  return <section className="dashboard-selected-device" data-device-tone={gasStatusTone(device.kind, current)} aria-labelledby="device-control-title">
    <div className="dashboard-selected-heading">
      <span className={`dashboard-device-icon ${current.on ? 'is-on' : ''}`}><Icon size={19} strokeWidth={1.5} aria-hidden="true" /></span>
      <div className="dashboard-selected-copy">
        <h3 id="device-control-title" tabIndex={-1} title={device.name}>{device.name}</h3>
        <p aria-live="polite">{deviceStatus(device, current)}</p>
      </div>
    </div>
    <div data-inline-device-actions="">
      <div className="dashboard-primary-actions">
        <button type="button" className="dashboard-primary-action" role={isSwitch ? 'switch' : undefined} aria-checked={isSwitch ? current.on : undefined} aria-label={actionAriaLabel} onClick={() => toggleDevice(device.id)}>
          <span>{actionLabel}</span>
          {isSwitch ? <span className="dashboard-switch-mark" aria-hidden="true"><span /></span> : null}
        </button>
        <button type="button" className="dashboard-full-controls" onClick={() => onFullControls(device.id)}>Full controls<ArrowUpRight size={14} aria-hidden="true" /></button>
      </div>
      {hasPrimaryLevel ? <div className="dashboard-level-control">
        <div className="dashboard-level-heading"><label htmlFor={rangeId}>{isTemperature ? 'Target temperature' : device.levelLabel}</label><output htmlFor={rangeId}>{levelText}</output></div>
        <input id={rangeId} type="range" min={isTemperature ? 15 : 0} max={isTemperature ? 28 : 100} step="1" value={levelValue} aria-valuetext={levelText} onChange={(event) => isTemperature ? setDeviceSetting(device.id, 'tempC', Number(event.currentTarget.value)) : setDeviceLevel(device.id, Number(event.currentTarget.value))} />
      </div> : null}
    </div>
  </section>;
}

/** Subscribe each room row to its own state so unrelated devices stay inexpensive. */
function DashboardDeviceRow({ device, selected }: { device: DeviceDefinition; selected: boolean }) {
  const storedState = useHomeStore((state) => state.deviceStates[device.id]);
  const selectDevice = useHomeStore((state) => state.selectDevice);
  const current = storedState ?? { on: device.defaultOn, level: device.defaultLevel };
  const Icon = DEVICE_ICONS[device.kind];
  return <button type="button" className={`dashboard-device-row ${selected ? 'is-selected' : ''}`} data-device-tone={gasStatusTone(device.kind, current)} aria-pressed={selected} onClick={() => selectDevice(device.id)}>
    <Icon size={17} strokeWidth={1.5} aria-hidden="true" />
    <span className="dashboard-device-copy"><span title={device.name}>{device.name}</span><small>{deviceStatus(device, current)}</small></span>
    <span className={`dashboard-device-indicator ${current.on || isMonitor(device.kind) ? 'is-on' : ''}`} aria-hidden="true" />
  </button>;
}

/** Keep primary controls and three room devices within a fixed-height tablet panel. */
export function DashboardInspector({ onFullControls, onBrowseDevices }: DashboardInspectorProps) {
  const roomId = useHomeStore((state) => state.roomId);
  const selectedId = useHomeStore((state) => state.selectedDevice);
  const room = getRoom(roomId);
  const roomDevices = DEVICES.filter((device) => device.roomId === room.id);
  const selected = getDevice(selectedId);
  const selectedDevice = selected?.roomId === room.id ? selected : undefined;
  const selectionKey = `${room.id}:${selectedDevice?.id ?? ''}`;
  const selectedIndex = roomDevices.findIndex((device) => device.id === selectedDevice?.id);
  const selectedPage = Math.floor(Math.max(0, selectedIndex) / DEVICES_PER_PAGE);
  const [pageRequest, setPageRequest] = useState({ selectionKey, page: selectedPage });
  const pageCount = Math.max(1, Math.ceil(roomDevices.length / DEVICES_PER_PAGE));
  // A hotspot selection reveals its page; manual paging never changes the device.
  const page = Math.min(pageCount - 1, pageRequest.selectionKey === selectionKey ? pageRequest.page : selectedPage);
  const pageStart = page * DEVICES_PER_PAGE;
  const visibleDevices = roomDevices.slice(pageStart, pageStart + DEVICES_PER_PAGE);
  const rangeLabel = roomDevices.length ? `${pageStart + 1}–${pageStart + visibleDevices.length} of ${roomDevices.length}` : '0 devices';

  return <aside className="device-inspector dashboard-inspector" aria-labelledby="dashboard-inspector-room">
    <header className="dashboard-inspector-heading"><h2 id="dashboard-inspector-room" title={room.name}>{room.name}</h2><span className="dashboard-room-mark" aria-hidden="true" /></header>
    {selectedDevice ? <SelectedDeviceSummary device={selectedDevice} onFullControls={onFullControls} /> : <section className="dashboard-empty"><h3>No device selected</h3><p>{roomDevices.length ? 'Select a device below or in your home.' : 'Choose another room to explore its devices.'}</p></section>}
    <section className="dashboard-room-devices" aria-labelledby="dashboard-devices-heading">
      <div className="dashboard-list-heading"><h3 id="dashboard-devices-heading">In this room</h3><span aria-live="polite">{rangeLabel}</span></div>
      <div id="dashboard-room-device-list" className="dashboard-device-list">
        {visibleDevices.map((device) => <DashboardDeviceRow key={device.id} device={device} selected={device.id === selectedDevice?.id} />)}
        {!roomDevices.length ? <p className="dashboard-no-devices">A quiet space, ready to explore.</p> : null}
      </div>
    </section>
    <footer className="dashboard-device-footer">
      <button type="button" className="dashboard-page-button" aria-label="Previous devices" aria-controls="dashboard-room-device-list" disabled={page === 0} onClick={() => setPageRequest({ selectionKey, page: page - 1 })}><ChevronLeft size={18} aria-hidden="true" /></button>
      <button type="button" className="dashboard-page-button" aria-label="Next devices" aria-controls="dashboard-room-device-list" disabled={page === pageCount - 1} onClick={() => setPageRequest({ selectionKey, page: page + 1 })}><ChevronRight size={18} aria-hidden="true" /></button>
      <button type="button" className="dashboard-browse-devices" onClick={onBrowseDevices}><Grid2X2 size={15} aria-hidden="true" />All devices</button>
    </footer>
  </aside>;
}
