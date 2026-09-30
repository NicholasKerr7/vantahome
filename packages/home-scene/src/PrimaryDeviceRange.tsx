import type { DeviceDefinition } from './data';
import { primaryDeviceRange } from './quickDevicePresentation';
import { useHomeStore, type DeviceState } from './state';

/** Share the same bounded setting between mobile hotspots and the tablet inspector. */
export function PrimaryDeviceRange({ device, current, location }: { device: DeviceDefinition; current: DeviceState; location: 'quick' | 'dashboard' }) {
  const setSetting = useHomeStore((state) => state.setDeviceSetting);
  const range = primaryDeviceRange(device, current);
  if (!range) return null;
  const { capability, label, value, text, hint } = range;
  const id = `${location}-level-${device.id}`;
  const hintId = `${id}-hint`;
  return <div className={`${location}-level-control`}>
    <div className={`${location}-level-heading`}><label htmlFor={id}>{label}</label><output htmlFor={id}>{text}</output></div>
    <input id={id} type="range" min={capability.min} max={capability.max} step={capability.step ?? 1}
      value={value} aria-valuetext={text} aria-describedby={hintId}
      onChange={(event) => setSetting(device.id, capability.field, Number(event.currentTarget.value))} />
    <p id={hintId} className={`${location}-level-hint`}>{hint}</p>
  </div>;
}
