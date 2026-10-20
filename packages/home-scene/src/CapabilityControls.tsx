import { formatCapabilityValue, hasLegacyLevel, readDeviceSetting, type DeviceCapability } from './deviceCapabilities';
import type { DeviceDefinition } from './data';
import { isOpeningDeviceKind, readOpeningPosition } from './openingPosition';
import { useHomeStore, type DeviceState } from './state';

/** Preserve established primary-slider identifiers when full controls use the shared schema. */
function controlId(device: DeviceDefinition, capability: DeviceCapability, prefix: string): string {
  const primaryRange = capability.type === 'range' && ['brightness', 'speed', 'openPercent', 'tempC'].includes(capability.field);
  return prefix === 'sheet-' && hasLegacyLevel(device) && primaryRange
    ? `sheet-level-${device.id}` : `${prefix}${device.id}-${capability.id}`;
}

/** Render schema-backed controls with native labels, bounds and keyboard behavior. */
export function CapabilityControls({ device, current, capabilities, prefix, configurationExplained = false }: { device: DeviceDefinition; current: DeviceState; capabilities: readonly DeviceCapability[]; prefix: string; configurationExplained?: boolean }) {
  const setSetting = useHomeStore((state) => state.setDeviceSetting);
  const runAction = useHomeStore((state) => state.runDeviceAction);
  const unknownPosition = isOpeningDeviceKind(device.kind) && readOpeningPosition(current) === null;
  return <div className="capability-controls">{capabilities.map((capability) => {
    const id = controlId(device, capability, prefix);
    // Unpaged legacy cards have no shared context row, so keep the limitation in each label.
    const label = capability.configurationOnly && !configurationExplained ? `${capability.label} · saved only` : capability.label;
    if (capability.type === 'action') {
      const unavailable = unknownPosition && capability.operation?.type === 'increment' && capability.operation.field === 'openPercent';
      return <button key={capability.id} data-capability-id={capability.id} type="button" className="capability-action"
        disabled={unavailable} onClick={() => runAction(device.id, capability.id)}>{capability.label}</button>;
    }
    const value = readDeviceSetting(device, current, capability.field);
    if (capability.type === 'stat') return <div key={capability.id} data-capability-id={capability.id} className="capability-reading"><span>{capability.label}</span><output>{formatCapabilityValue(capability, value)}</output></div>;
    if (capability.type === 'toggle') return <div key={capability.id} data-capability-id={capability.id} className="capability-toggle"><label htmlFor={id}>{label}</label><button id={id} type="button" role="switch" aria-checked={Boolean(value)} className="power-switch" onClick={() => setSetting(device.id, capability.field, !value)}><span /></button></div>;
    if (capability.type === 'enum') return <div key={capability.id} data-capability-id={capability.id} className="capability-select"><label htmlFor={id}>{label}</label><select id={id} value={String(value)} onChange={(event) => {
      const option = capability.options.find((item) => String(item.value) === event.currentTarget.value);
      if (option) setSetting(device.id, capability.field, option.value);
    }}>{capability.options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select></div>;
    // Keep a finite disabled thumb without presenting its placeholder as an observed position.
    const unavailable = unknownPosition && capability.field === 'openPercent';
    const formatted = unavailable ? 'Position unavailable' : formatCapabilityValue(capability, value);
    return <div key={capability.id} data-capability-id={capability.id} className="level-control">
      <div className="level-heading"><label htmlFor={id}>{label}</label><output htmlFor={id}>{formatted}</output></div>
      <input id={id} type="range" min={capability.min} max={capability.max} step={capability.step ?? 1}
        value={unavailable ? capability.min : Number(value)} aria-valuetext={formatted} disabled={unavailable}
        onChange={(event) => { if (!unavailable) setSetting(device.id, capability.field, Number(event.currentTarget.value)); }} />
    </div>;
  })}</div>;
}
