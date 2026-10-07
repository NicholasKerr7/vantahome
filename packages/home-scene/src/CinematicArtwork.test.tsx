import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CinematicArtwork } from './CinematicCardArtwork';
import { deviceArtwork, roomArtwork } from './cinematicArtwork';
import { cinematicArtworkAssets } from './cinematicArtworkAssets';
import { DeviceControlSheet } from './DeviceControlSheet';
import { QuickDeviceControls } from './QuickDeviceControls';
import { DEVICES, ROOMS, getDevice } from './data';
import { FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';

vi.mock('./state', async (importOriginal) => {
  const original = await importOriginal<typeof import('./state')>();
  /** Use the current permission/device snapshot when server-rendering an interaction. */
  const readCurrent = <T,>(selector: (state: ReturnType<typeof original.useHomeStore.getState>) => T) => selector(original.useHomeStore.getState());
  return { ...original, useHomeStore: Object.assign(readCurrent, original.useHomeStore) };
});

afterEach(() => {
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  vi.unstubAllGlobals();
});

describe('packaged cinematic card imagery', () => {
  it('covers every current room and device with decorative, noninteractive art', () => {
    const artwork = [...ROOMS.map(roomArtwork), ...DEVICES.map(deviceArtwork)];
    for (const key of new Set(artwork)) {
      const markup = renderToStaticMarkup(<CinematicArtwork artwork={key} />);
      expect(cinematicArtworkAssets[key], key).toBeTruthy();
      expect(markup, key).toContain(`data-artwork="${key}" aria-hidden="true"`);
      expect(markup, key).toContain('alt=""');
      expect(markup, key).toContain('loading="lazy"');
      expect(markup, key).not.toMatch(/<button|tabindex|aria-label|role="img"/);
    }
  });

  it('gives all device kinds matching quick and full-control identities', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    const representatives = [...new Map(DEVICES.map((device) => [device.kind, device])).values()];
    for (const device of representatives) {
      const expected = `data-artwork="${deviceArtwork(device)}"`;
      const quick = renderToStaticMarkup(<QuickDeviceControls deviceId={device.id} onClose={() => undefined} onFullControls={() => undefined} />);
      const full = renderToStaticMarkup(<DeviceControlSheet deviceId={device.id} onClose={() => undefined} />);
      expect(quick, device.kind).toContain(expected);
      expect(full, device.kind).toContain(expected);
      expect(quick, device.kind).toContain('aria-describedby="quick-device-state"');
      expect(full, device.kind).toContain('class="device-sheet-state" aria-live="polite"');
    }
  });

  it('keeps imagery independent of power state and removes it with revoked controls', () => {
    const device = getDevice('family-tv')!;
    const artwork = `data-artwork="${deviceArtwork(device)}"`;
    const render = () => renderToStaticMarkup(<QuickDeviceControls deviceId={device.id} onClose={() => undefined} onFullControls={() => undefined} />);
    const states = useHomeStore.getState().deviceStates;
    useHomeStore.setState({ deviceStates: { ...states, [device.id]: { ...states[device.id], on: true } } });
    const on = render();
    expect(on).toContain(artwork);
    expect(on).toContain('data-device-active="true"');
    useHomeStore.setState({ deviceStates: { ...states, [device.id]: { ...states[device.id], on: false } } });
    const off = render();
    expect(off).toContain(artwork);
    expect(off).toContain('data-device-active="false"');
    expect(off).toContain('Turn on');
    useHomeStore.getState().applyAccessSnapshot({}, { fullHome: false, roomIds: [], deviceIds: [], controllableDeviceIds: [] });
    expect(render()).toBe('');
    expect(renderToStaticMarkup(<DeviceControlSheet deviceId={device.id} onClose={() => undefined} />)).toBe('');
  });
});
