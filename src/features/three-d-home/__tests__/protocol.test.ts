import { scenePreviewCommandMessage, type ScenePreviewCommand } from '../../../../packages/home-scene/src/scenePreviewProtocol';
import { consumeScenePreviewCommand, isAllowedSceneNavigation, isCurrentSceneDocument, parseSceneStatus } from '../protocol';

describe('isolated scene protocol', () => {
  test.each(['ready', 'error'] as const)('accepts only the supported %s status', (status) => {
    const message = { channel: 'vantahome-scene', version: 1, status };
    expect(parseSceneStatus(message)).toBe(status);
    expect(parseSceneStatus(JSON.stringify(message))).toBe(status);
  });
  test.each([null, [], 'invalid', 'x'.repeat(257), { channel: 'vantahome-scene', version: 2, status: 'ready' }, { channel: 'vantahome-scene', version: 1, status: 'toggle' }, { channel: 'vantahome-scene', version: 1, status: 'ready', deviceId: 'lamp' }])('rejects unsupported or command-like input %#', (value) => {
    expect(parseSceneStatus(value)).toBeNull();
  });
  test('allows only the local packaged document, its fragment and initial blank page', () => {
    const uri = 'file:///app/cache/home-scene/hash/index.html';
    expect(isAllowedSceneNavigation(uri, uri)).toBe(true);
    expect(isAllowedSceneNavigation(`${uri}#home`, uri)).toBe(true);
    expect(isAllowedSceneNavigation('about:blank', uri)).toBe(true);
    for (const rejected of ['https://example.com', 'javascript:alert(1)', 'file:///app/secrets', `${uri}?redirect=x`, `${uri}.other`]) {
      expect(isAllowedSceneNavigation(rejected, uri)).toBe(false);
    }
  });
});

/** An ordinary comfort-only preview is sufficient to exercise host delivery, not device execution. */
function previewCommand(id: number): ScenePreviewCommand {
  return scenePreviewCommandMessage(id, { title: 'Evening', expiresAt: Date.now() + 60_000,
    actions: [{ deviceId: 'living-light', values: { brightness: 20 }, baseline: { brightness: 31 } }] });
}

describe('display-only preview delivery', () => {
  const eligible = { ready: true, canNavigate: true, suspended: false };

  test('consumes a fresh command once and ignores duplicate or older IDs', () => {
    const consumed = { current: 0 };
    const message = previewCommand(3);
    expect(consumeScenePreviewCommand(message, consumed, eligible)).toEqual(message);
    expect(consumed.current).toBe(3);
    expect(consumeScenePreviewCommand({ ...message }, consumed, eligible)).toBeNull();
    expect(consumeScenePreviewCommand(previewCommand(2), consumed, eligible)).toBeNull();
    expect(consumeScenePreviewCommand(previewCommand(4), consumed, eligible)?.id).toBe(4);
  });

  test.each(['ready', 'canNavigate', 'suspended'] as const)('drops %s-ineligible commands permanently instead of replaying after recovery', (field) => {
    const consumed = { current: 0 };
    const blocked = { ...eligible, [field]: field === 'suspended' };
    const message = previewCommand(7);
    expect(consumeScenePreviewCommand(message, consumed, blocked)).toBeNull();
    expect(consumed.current).toBe(7);
    expect(consumeScenePreviewCommand({ ...message }, consumed, eligible)).toBeNull();
    expect(consumeScenePreviewCommand(previewCommand(8), consumed, eligible)?.id).toBe(8);
  });

  test('allows one explicit clear while covered but still requires readiness and current access', () => {
    const consumed = { current: 0 };
    const clear = scenePreviewCommandMessage(1, null);
    expect(consumeScenePreviewCommand(clear, consumed, { ...eligible, suspended: true })).toEqual(clear);
    expect(consumeScenePreviewCommand(clear, consumed, eligible)).toBeNull();
    expect(consumeScenePreviewCommand(scenePreviewCommandMessage(2, null), consumed, { ...eligible, ready: false })).toBeNull();
    expect(consumeScenePreviewCommand(scenePreviewCommandMessage(3, null), consumed, { ...eligible, canNavigate: false })).toBeNull();
    expect(consumed.current).toBe(3);
  });

  test('malformed or absent commands cannot poison the replay watermark', () => {
    const consumed = { current: 5 };
    expect(consumeScenePreviewCommand(undefined, consumed, eligible)).toBeNull();
    expect(consumeScenePreviewCommand({ ...previewCommand(99), version: 2 } as unknown as ScenePreviewCommand, consumed, eligible)).toBeNull();
    expect(consumeScenePreviewCommand(previewCommand(NaN), consumed, eligible)).toBeNull();
    expect(consumed.current).toBe(5);
    expect(consumeScenePreviewCommand(previewCommand(6), consumed, eligible)?.id).toBe(6);
  });

  test('trusted report documents exclude initial blank, replaced files and URL lookalikes', () => {
    const uri = 'file:///app/cache/home-scene/current/index.html';
    expect(isCurrentSceneDocument(uri, uri)).toBe(true);
    expect(isCurrentSceneDocument(`${uri}#view`, uri)).toBe(true);
    for (const url of [undefined, 'about:blank', 'file:///app/cache/home-scene/old/index.html', `${uri}?next=other`, `${uri}.other`, 'https://example.invalid']) {
      expect(isCurrentSceneDocument(url, uri)).toBe(false);
    }
  });
});
