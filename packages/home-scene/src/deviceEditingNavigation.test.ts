import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTHORED_DEVICES, getDevice } from './data';
import { createDefaultDevicePlacement, replaceRuntimeDevices } from './devicePlacement';
import { parseDeviceEditingRequest } from './deviceEditingNavigation';
import { requestDeviceEditing } from './requestDeviceEditing';
import { parseSceneAccess } from './sceneAccess';

const deviceId = 'placed-00000000-0000-4000-8000-000000000001';
const request = { channel: 'vantahome-navigation', version: 1, type: 'device-edit', deviceId } as const;

beforeEach(() => {
  replaceRuntimeDevices([{ id: deviceId, name: 'Reading light', placement: createDefaultDevicePlacement('master-bedside-left', 'living')! }]);
});
afterEach(() => { replaceRuntimeDevices([]); vi.unstubAllGlobals(); });

describe('placed device edit navigation', () => {
  it('accepts a known current fixture in structured web and serialized native envelopes', () => {
    expect(parseDeviceEditingRequest(request)).toEqual(request);
    expect(parseDeviceEditingRequest(JSON.stringify(request))).toEqual(request);
    replaceRuntimeDevices([]);
    expect(parseDeviceEditingRequest(request)).toBeNull();
  });

  it.each([
    null, undefined, true, 1, [], [request], '{}', 'not JSON',
    { ...request, channel: 'vantahome-simulation' }, { ...request, version: '1' }, { ...request, version: 2 },
    { ...request, type: 'toggle' }, { ...request, deviceId: 'living-light' }, { ...request, deviceId: 'entry-gate' },
    { ...request, deviceId: 'placed-00000000-0000-4000-8000-000000000099' }, { ...request, deviceId: 2 },
    { ...request, changes: { on: true } }, { ...request, placement: { position: [0, 0, 0] } },
    { ...request, homeId: 'another-home' }, { ...request, userId: 'owner' },
    { channel: request.channel, version: 1, deviceId }, Object.create(request),
  ])('rejects authored, unknown, malformed or command-bearing payload %#', (input) => {
    expect(parseDeviceEditingRequest(input)).toBeNull();
  });

  it('bounds serialized navigation requests before parsing', () => {
    const encoded = JSON.stringify(request);
    expect(parseDeviceEditingRequest(encoded.padEnd(256, ' '))).toEqual(request);
    expect(parseDeviceEditingRequest(encoded.padEnd(257, ' '))).toBeNull();
  });

  it('sends only navigation to an embedded native host and never includes edited values', () => {
    const nativePost = vi.fn();
    const parentPost = vi.fn();
    vi.stubGlobal('__VANTAHOME_EMBEDDED__', true);
    vi.stubGlobal('window', { ReactNativeWebView: { postMessage: nativePost }, parent: { postMessage: parentPost } });
    requestDeviceEditing(deviceId);
    expect(nativePost).toHaveBeenCalledExactlyOnceWith(JSON.stringify(request));
    expect(parentPost).not.toHaveBeenCalled();
    requestDeviceEditing('living-light');
    replaceRuntimeDevices([]);
    requestDeviceEditing(deviceId);
    expect(nativePost).toHaveBeenCalledTimes(1);
  });

  it('uses the exact containing frame on web and sends nothing in the standalone model', () => {
    const parentPost = vi.fn();
    vi.stubGlobal('window', { parent: { postMessage: parentPost } });
    vi.stubGlobal('__VANTAHOME_EMBEDDED__', false);
    requestDeviceEditing(deviceId);
    expect(parentPost).not.toHaveBeenCalled();
    vi.stubGlobal('__VANTAHOME_EMBEDDED__', true);
    requestDeviceEditing(deviceId);
    expect(parentPost).toHaveBeenCalledExactlyOnceWith(request, '*');
  });
});

describe('edit action visibility capability', () => {
  const access = { fullHome: false, roomIds: ['living'], deviceIds: [deviceId], controllableDeviceIds: [], editableDeviceIds: [deviceId] };

  it('allows a visible custom fixture without treating editing as a device-control grant', () => {
    expect(parseSceneAccess(access)).toEqual(access);
    expect(parseSceneAccess({ ...access, editableDeviceIds: [] })?.editableDeviceIds).toEqual([]);
    const { editableDeviceIds: _ignored, ...legacy } = access;
    expect(parseSceneAccess(legacy)).toEqual(legacy);
  });

  it.each([
    { editableDeviceIds: true }, { editableDeviceIds: [deviceId, deviceId] }, { editableDeviceIds: [17] },
    { editableDeviceIds: ['living-light'] }, { deviceIds: [], editableDeviceIds: [deviceId] },
    { editableDeviceIds: ['placed-00000000-0000-4000-8000-000000000099'] },
    { roomIds: ['master'] },
  ])('rejects malformed, duplicate, non-visible or authored editable grants %#', (patch) => {
    expect(parseSceneAccess({ ...access, ...patch })).toBeNull();
  });

  it('caps the edit capability at the same 32 placed-device limit as the catalog', () => {
    const template = getDevice(deviceId)!;
    const devices = Array.from({ length: 33 }, (_, index) => ({ ...template, id: `placed-00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` }));
    const ids = devices.map((device) => device.id);
    const catalog = [...AUTHORED_DEVICES, ...devices];
    expect(parseSceneAccess({ ...access, deviceIds: ids, editableDeviceIds: ids }, catalog)).toBeNull();
    expect(parseSceneAccess({ ...access, deviceIds: ids.slice(0, 32), editableDeviceIds: ids.slice(0, 32) }, catalog)).not.toBeNull();
  });
});
