import { useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Grid2X2, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { DEVICES, getDevice, getRoom, type DeviceDefinition, type DeviceId } from './data';
import { DEVICE_ICONS } from './DeviceControlCard';
import { deviceStatus, isMonitor } from './deviceCapabilities';
import { PrimaryDeviceRange } from './PrimaryDeviceRange';
import { primaryDeviceAction } from './quickDevicePresentation';
import { gasStatusTone } from './gasSimulation';
import { useHomeStore } from './state';
import { deviceCardReading } from './dashboardCardPresentation';
import './dashboard-inspector.css';
import './dashboard-cards.css';

interface DashboardInspectorProps {
  onFullControls: (id: DeviceId) => void;
  onBrowseDevices: () => void;
}

const DEVICES_PER_PAGE = 2;

/** Give the selected device the same kind-aware action used by hotspot controls. */
function SelectedDeviceSummary({ device, onFullControls }: { device: DeviceDefinition; onFullControls: (id: DeviceId) => void }) {
  const storedState = useHomeStore((state) => state.deviceStates[device.id]);
  const toggleDevice = useHomeStore((state) => state.toggleDevice);
  const current = storedState ?? { on: device.defaultOn, level: device.defaultLevel };
  const Icon: LucideIcon = DEVICE_ICONS[device.kind];
  const action = primaryDeviceAction(device, current);
  const reading = deviceCardReading(device, current);

  return <section className="dashboard-selected-device device-focus-card" data-device-active={current.on} data-device-tone={gasStatusTone(device.kind, current)} aria-labelledby="device-control-title">
    <div className="dashboard-selected-heading">
      <span className={`dashboard-device-icon ${current.on ? 'is-on' : ''}`}><Icon size={19} strokeWidth={1.5} aria-hidden="true" /></span>
      <div className="dashboard-selected-copy">
        <span className="device-focus-eyebrow">SELECTED DEVICE</span>
        <h3 id="device-control-title" tabIndex={-1} title={device.name}>{device.name}</h3>
      </div>
    </div>
    <div className="device-focus-actions" data-inline-device-actions="">
      <div className="device-focus-face">
        <div className="device-focus-reading" data-long-reading={reading.value.length > 12} aria-live="polite"><strong>{reading.value}</strong><span>{reading.caption}</span></div>
        <button type="button" className="dashboard-primary-action" role={action.isSwitch ? 'switch' : undefined} aria-checked={action.isSwitch ? current.on : undefined} aria-label={action.accessibleLabel} onClick={() => toggleDevice(device.id)}>
          <span>{action.label}</span>
          {action.isSwitch ? <span className="dashboard-switch-mark" aria-hidden="true"><span /></span> : null}
        </button>
      </div>
      <PrimaryDeviceRange device={device} current={current} location="dashboard" />
      <button type="button" className="dashboard-full-controls device-focus-details" onClick={() => onFullControls(device.id)}><SlidersHorizontal size={14} aria-hidden="true" /><span>Full controls</span><ArrowUpRight size={14} aria-hidden="true" /></button>
    </div>
  </section>;
}

/** A compact tile exposes identity and state; selection opens the separate action card. */
function DashboardDeviceCard({ device, selected }: { device: DeviceDefinition; selected: boolean }) {
  const storedState = useHomeStore((state) => state.deviceStates[device.id]);
  const selectDevice = useHomeStore((state) => state.selectDevice);
  const current = storedState ?? { on: device.defaultOn, level: device.defaultLevel };
  const Icon = DEVICE_ICONS[device.kind];
  return <button type="button" className={`dashboard-device-row dashboard-device-card ${selected ? 'is-selected' : ''}`} data-device-active={current.on} data-device-tone={gasStatusTone(device.kind, current)} aria-pressed={selected} onClick={() => selectDevice(device.id)}>
    <span className="device-card-top"><Icon size={18} strokeWidth={1.5} aria-hidden="true" /><span className={`dashboard-device-indicator ${current.on || isMonitor(device.kind) ? 'is-on' : ''}`} aria-hidden="true" /></span>
    <span className="dashboard-device-copy"><span title={device.name}>{device.name}</span><small>{deviceStatus(device, current)}</small></span>
  </button>;
}

/** Give selected controls and two room tiles separate spaces within a fixed-height panel. */
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

  return <aside className="device-inspector dashboard-inspector card-inspector" aria-labelledby="dashboard-inspector-room">
    <header className="dashboard-inspector-heading"><div><span className="device-focus-eyebrow">ROOM CONTROLS</span><h2 id="dashboard-inspector-room" title={room.name}>{room.name}</h2></div><span className="inspector-device-count" aria-label={`${roomDevices.length} devices`}>{roomDevices.length}</span></header>
    {selectedDevice ? <SelectedDeviceSummary device={selectedDevice} onFullControls={onFullControls} /> : <section className="dashboard-empty"><h3>No device selected</h3><p>{roomDevices.length ? 'Select a device below or in your home.' : 'Choose another room to explore its devices.'}</p></section>}
    <section className="dashboard-room-devices" aria-labelledby="dashboard-devices-heading">
      <div className="dashboard-list-heading"><h3 id="dashboard-devices-heading">In this room</h3><span aria-live="polite">{rangeLabel}</span></div>
      <div id="dashboard-room-device-list" className="dashboard-device-list device-card-grid">
        {visibleDevices.map((device) => <DashboardDeviceCard key={device.id} device={device} selected={device.id === selectedDevice?.id} />)}
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
