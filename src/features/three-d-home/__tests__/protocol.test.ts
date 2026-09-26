import { isAllowedSceneNavigation, parseSceneStatus } from '../protocol';

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
