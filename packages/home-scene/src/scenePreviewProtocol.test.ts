import { describe, expect, it, vi } from 'vitest';
import { SCENE_PREVIEW_CHANNEL, nativeScenePreviewCommandScript, parseScenePreviewCommand, parseScenePreviewReport,
  reportScenePreview, scenePreviewCommandMessage, subscribeScenePreviewCommands, type ScenePreviewPayload } from './scenePreviewProtocol';

const preview: ScenePreviewPayload = { title: 'Living room evening', expiresAt: 2_000_000_000_000,
  actions: [{ deviceId: 'living-light', values: { isOn: true, brightness: 20 }, baseline: { isOn: false, brightness: 65 } }] };

/** Exercise exact parent/native identities without loading WebGL or a real device. */
function hostWindow(native: boolean) {
  const listeners = new Map<string, EventListener>();
  const parent = { postMessage: vi.fn() };
  const postMessage = vi.fn();
  const target = { parent, ReactNativeWebView: native ? { postMessage } : undefined,
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  } as unknown as Window;
  return { target, parent, postMessage, listeners,
    emit: (type: string, event: unknown) => listeners.get(type)?.(event as Event) };
}

describe('scene preview presentation protocol', () => {
  it('round-trips set, clear and bounded presentation reports across native and browser envelopes', () => {
    for (const command of [scenePreviewCommandMessage(1, preview), scenePreviewCommandMessage(2, null)]) {
      expect(parseScenePreviewCommand(command)).toEqual(command);
      expect(parseScenePreviewCommand(JSON.stringify(command))).toEqual(command);
      expect(nativeScenePreviewCommandScript(command)).toContain(JSON.stringify(parseScenePreviewCommand(command)));
    }
    for (const status of ['active', 'closed', 'expired', 'invalid', 'stale']) {
      const report = { channel: SCENE_PREVIEW_CHANNEL, version: 1, type: 'status', id: 1, status };
      expect(parseScenePreviewReport(JSON.stringify(report))).toEqual(report);
    }
    for (const modelRoomId of ['living', null]) {
      const report = { channel: SCENE_PREVIEW_CHANNEL, version: 1, type: 'selection', modelRoomId };
      expect(parseScenePreviewReport(report)).toEqual(report);
    }
  });

  it('rejects sensitive kinds, duplicate devices, arbitrary keys, coercion and oversized payloads', () => {
    const command = scenePreviewCommandMessage(1, preview);
    const action = preview.actions[0];
    for (const input of [null, [], 'bad json', 'x'.repeat(32_769), { ...command, id: 0 }, { ...command, id: '1' },
      { ...command, id: Number.MAX_SAFE_INTEGER + 1 }, { ...command, accountId: 'private' }, { ...command, version: 2 },
      ...[{ title: 'x'.repeat(81) }, { title: 'unsafe\nline' }, { expiresAt: Infinity }, { actions: [] }, { actions: Array(33).fill(action) },
        { actions: [action, action] }, { actions: [{ ...action, deviceId: 'entry-gate', values: { openPercent: 100 }, baseline: { openPercent: 0 } }] },
        { actions: [{ ...action, deviceId: 'not-a-device' }] }, { actions: [{ ...action, canControl: true }] },
        ...[{ isOn: 'true' }, { brightness: 101 }, { brightness: 20.5 }, { isOn: true, brightness: null }, { armed: true }, { tempC: 22 }]
          .map((values) => ({ actions: [{ ...action, values }] })),
        { actions: [{ ...action, baseline: { isOn: false } }] }, { actions: [{ ...action, baseline: { ...action.baseline, volume: 10 } }] },
      ].map((change) => ({ ...command, preview: { ...preview, ...change } })),
    ]) expect(parseScenePreviewCommand(input)).toBeNull();
  });

  it('rejects labels, readings, unknown rooms and extra fields in selection reports', () => {
    const message = { channel: SCENE_PREVIEW_CHANNEL, version: 1, type: 'selection', modelRoomId: 'living' };
    for (const input of [{ ...message, modelRoomId: 'secret-room' }, { ...message, roomLabel: 'Bedroom' }, { ...message, temperature: 22 },
      { ...message, modelRoomId: 1 }, { ...message, deviceIds: [] }]) expect(parseScenePreviewReport(input)).toBeNull();
    expect(parseScenePreviewReport({ channel: SCENE_PREVIEW_CHANNEL, version: 1, type: 'status', id: 1, status: 'executed' })).toBeNull();
  });

  it.each([false, true])('binds the %s native channel to the containing host and removes all listeners', (native) => {
    const host = hostWindow(native); const receive = vi.fn();
    const stop = subscribeScenePreviewCommands(host.target, receive);
    const command = scenePreviewCommandMessage(1, preview);
    host.emit('message', { source: {}, data: command }); expect(receive).not.toHaveBeenCalled();
    host.emit('message', { source: host.parent, data: command });
    expect(receive).toHaveBeenCalledTimes(native ? 0 : 1);
    host.emit(SCENE_PREVIEW_CHANNEL, { detail: command }); expect(receive).toHaveBeenCalledTimes(1);
    const report = { channel: SCENE_PREVIEW_CHANNEL, version: 1, type: 'status', id: 1, status: 'active' } as const;
    reportScenePreview(host.target, report);
    if (native) expect(host.postMessage).toHaveBeenCalledWith(JSON.stringify(report));
    else expect(host.parent.postMessage).toHaveBeenCalledWith(report, '*');
    stop(); expect(host.listeners.size).toBe(0);
  });
});
