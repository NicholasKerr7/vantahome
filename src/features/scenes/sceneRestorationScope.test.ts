import { createSceneReceiptDescriptor, sceneRestorationIdentity, sceneRestorationScope } from './sceneRestorationScope';
import { virtualSceneHome } from './sceneTestFixtures';

test('receipt identity survives session refresh but isolates account, household and member changes', () => {
  const home = virtualSceneHome();
  const identity = sceneRestorationIdentity(home);
  expect(sceneRestorationIdentity({ ...home, sessionEpoch: home.sessionEpoch + 1, membershipReady: false })).toBe(identity);
  for (const change of [{ accountUserId: 'another' }, { authenticatedUserId: 'another' }, { accountHomeId: 'another' },
    { activeHomeId: 'another' }, { activeMemberId: 'another' }]) expect(sceneRestorationIdentity({ ...home, ...change })).not.toBe(identity);
  expect(sceneRestorationScope(home)).toContain('preview:');
});

test('local modeled homes share the canonical demo record but receipts remain member-owned', () => {
  const home = virtualSceneHome({ accountUserId: null, authenticatedUserId: null, accountHomeId: null, activeHomeId: null,
    modelCatalogVersion: 1, realtime: { ...virtualSceneHome().realtime, enabled: false, useMqtt: false } });
  expect(sceneRestorationScope(home)).toBe('demo');
  expect(sceneRestorationIdentity({ ...home, activeMemberId: 'other' })).not.toBe(sceneRestorationIdentity(home));
});

test('every run has a unique bounded descriptor even with an unchanged timestamp and scene', () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(100);
  const home = virtualSceneHome();
  const scene = { id: 'same-scene', name: 'Evening\n' };
  try {
    const first = createSceneReceiptDescriptor(home, scene);
    const second = createSceneReceiptDescriptor(home, scene);
    expect(first.runId).not.toBe(second.runId);
    expect(first).toMatchObject({ createdAt: 100, sceneId: 'same-scene', sceneName: 'Evening', identityKey: sceneRestorationIdentity(home) });
    expect(first.runId.length).toBeLessThanOrEqual(160);
  } finally { now.mockRestore(); }
});
