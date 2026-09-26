import { ArrowDown, ArrowUp, BatteryCharging, Camera, Coffee, DoorClosed, Droplets, Fan, Fence, Flame, Gauge, Lightbulb, Microwave, PanelTop, PlugZap, Refrigerator, ShieldAlert, SlidersHorizontal, Snowflake, Sun, Tv, Volume2, WashingMachine, Wind, type LucideIcon } from 'lucide-react';
import { formatDeviceLevel, getDevice, isPositionDevice, type DeviceDefinition, type DeviceId } from './data';
import { deviceStatus, getCapabilities, hasLegacyLevel, isMonitor, quickActionLabel, readDeviceSetting } from './deviceCapabilities';
import { CapabilityControls } from './CapabilityControls';
import { useHomeStore } from './state';

export const DEVICE_ICONS: Record<DeviceDefinition['kind'], LucideIcon> = {
  light: Lightbulb, fan: Fan, tv: Tv, washer: WashingMachine, ac: Snowflake, blinds: SlidersHorizontal, gate: Fence,
  coffee: Coffee, fridge: Refrigerator, garage: PanelTop, door: DoorClosed, vacuum: Gauge, camera: Camera, window: PanelTop,
  stove: Flame, dryer: Wind, dishwasher: Droplets, microwave: Microwave, energy: PlugZap, water: Droplets,
  'water-heater': Flame, air: Wind, sprinkler: Droplets, speaker: Volume2, smoke: ShieldAlert,
  generator: PlugZap, battery: BatteryCharging, solar: Sun,
};

/** Share meaningful appliance, security and monitoring controls across both inspectors. */
export function DeviceControlCard({ deviceId, inSheet = false }: { deviceId: DeviceId; inSheet?: boolean }) {
  const current = useHomeStore((state) => state.deviceStates[deviceId]);
  const toggleDevice = useHomeStore((state) => state.toggleDevice);
  const setDeviceLevel = useHomeStore((state) => state.setDeviceLevel);
  const setDeviceSetting = useHomeStore((state) => state.setDeviceSetting);
  const device = getDevice(deviceId)!;
  const Icon = DEVICE_ICONS[device.kind];
  const isCover = isPositionDevice(device);
  const coverName = `smart ${device.kind === 'garage' ? 'shutter' : device.kind}`;
  const prefix = inSheet ? 'sheet-' : '';
  const rangeId = `${prefix}level-${deviceId}`;
  const legacyRange = hasLegacyLevel(device);
  const temperatureRange = device.kind === 'ac';
  const levelValue = temperatureRange ? Number(readDeviceSetting(device, current, 'tempC')) : current.level;
  const levelText = temperatureRange ? `${levelValue}°C` : formatDeviceLevel(device, current.level);
  const capabilities = getCapabilities(device.kind).filter((item) => !(legacyRange && 'field' in item && ['brightness', 'speed', 'openPercent', 'tempC'].includes(item.field)));
  const readings = capabilities.filter((item) => item.type === 'stat');
  const controls = capabilities.filter((item) => item.type !== 'stat');
  const actionOnly = isMonitor(device.kind) || ['door', 'camera', 'coffee', 'vacuum', 'washer', 'dryer', 'dishwasher', 'microwave', 'generator'].includes(device.kind);
  const status = deviceStatus(device, current);

  return <section className="device-card" aria-label={device.name}>
    <div className="device-card-top"><span className={`device-illustration ${current.on ? 'is-on' : ''}`}><Icon size={29} strokeWidth={1.25} aria-hidden="true" /></span><span className={`device-status ${current.on ? 'is-on' : ''}`}><span />{status}</span></div>
    <h3 id={inSheet ? 'sheet-device-control-title' : 'device-control-title'} tabIndex={-1}>{device.name}</h3><p>{device.description}</p>
    <div data-inline-device-actions={inSheet ? undefined : ''}>
      {isCover ? <div className="cover-actions" role="group" aria-label={`${device.kind === 'blinds' ? 'Blind' : device.kind === 'gate' ? 'Gate' : 'Opening'} position`}>
        <button type="button" aria-label={`Open ${coverName}`} aria-pressed={current.level === 100} onClick={() => setDeviceLevel(deviceId, 100)}><ArrowUp size={16} aria-hidden="true" />Open</button>
        <button type="button" aria-label={`Close ${coverName}`} aria-pressed={current.level === 0} onClick={() => setDeviceLevel(deviceId, 0)}><ArrowDown size={16} aria-hidden="true" />Close</button>
      </div> : actionOnly ? <button type="button" className="capability-action primary-device-action" onClick={() => toggleDevice(deviceId)}>{quickActionLabel(device, current)}</button> : <div className="power-row"><span>Power</span><button className="power-switch" role="switch" aria-checked={current.on} aria-label={`${device.name} power`} onClick={() => toggleDevice(deviceId)}><span /></button></div>}
      {readings.length ? <div className="device-readings" aria-label="Simulated readings"><p className="device-hint">Illustrative readings · no live hardware</p><CapabilityControls device={device} current={current} capabilities={readings} prefix={prefix} /></div> : null}
      {controls.length ? legacyRange || controls.length > 4 ? <details className="advanced-device-controls"><summary>{legacyRange ? 'More settings' : 'Modes & settings'}</summary><CapabilityControls device={device} current={current} capabilities={controls} prefix={prefix} /></details> : <CapabilityControls device={device} current={current} capabilities={controls} prefix={prefix} /> : null}
      {legacyRange ? <div className="level-control"><div className="level-heading"><label htmlFor={rangeId}>{temperatureRange ? 'Target temperature' : device.levelLabel}</label><output htmlFor={rangeId}>{levelText}</output></div><input id={rangeId} type="range" min={temperatureRange ? 15 : 0} max={temperatureRange ? 28 : 100} step="1" value={levelValue} onChange={(event) => temperatureRange ? setDeviceSetting(deviceId, 'tempC', Number(event.currentTarget.value)) : setDeviceLevel(deviceId, Number(event.currentTarget.value))} aria-valuetext={levelText} /><div className="range-labels"><span>{temperatureRange ? '15°C' : device.lowLabel}</span><span>{temperatureRange ? '28°C' : device.highLabel}</span></div><p className="device-hint">{isCover ? 'Choose any position, from fully closed to fully open.' : current.on ? 'Changes appear in your home preview.' : 'Value saved. Turn on to preview it.'}</p></div> : null}
    </div>
  </section>;
}
