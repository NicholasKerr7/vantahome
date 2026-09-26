import { formatCapabilityValue, readDeviceSetting, type DeviceCapability } from './deviceCapabilities';
import type { DeviceDefinition } from './data';
import { useHomeStore, type DeviceState } from './state';

/** Render schema-backed controls with native labels, bounds and keyboard behavior. */
export function CapabilityControls({ device, current, capabilities, prefix }: { device: DeviceDefinition; current: DeviceState; capabilities: readonly DeviceCapability[]; prefix: string }) {
  const setSetting = useHomeStore((state) => state.setDeviceSetting);
  const runAction = useHomeStore((state) => state.runDeviceAction);
  return <div className="capability-controls">{capabilities.map((capability) => {
    const id = `${prefix}${device.id}-${capability.id}`;
    if (capability.type === 'action') return <button key={capability.id} type="button" className="capability-action" onClick={() => runAction(device.id, capability.id)}>{capability.label}</button>;
    const value = readDeviceSetting(device, current, capability.field);
    if (capability.type === 'stat') return <div key={capability.id} className="capability-reading"><span>{capability.label}</span><output>{formatCapabilityValue(capability, value)}</output></div>;
    if (capability.type === 'toggle') return <div key={capability.id} className="capability-toggle"><label htmlFor={id}>{capability.label}</label><button id={id} type="button" role="switch" aria-checked={Boolean(value)} className="power-switch" onClick={() => setSetting(device.id, capability.field, !value)}><span /></button></div>;
    if (capability.type === 'enum') return <div key={capability.id} className="capability-select"><label htmlFor={id}>{capability.label}</label><select id={id} value={String(value)} onChange={(event) => {
      const option = capability.options.find((item) => String(item.value) === event.currentTarget.value);
      if (option) setSetting(device.id, capability.field, option.value);
    }}>{capability.options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select></div>;
    return <div key={capability.id} className="level-control"><div className="level-heading"><label htmlFor={id}>{capability.label}</label><output htmlFor={id}>{formatCapabilityValue(capability, value)}</output></div><input id={id} type="range" min={capability.min} max={capability.max} step={capability.step ?? 1} value={Number(value)} aria-valuetext={formatCapabilityValue(capability, value)} onChange={(event) => setSetting(device.id, capability.field, Number(event.currentTarget.value))} /></div>;
  })}</div>;
}
