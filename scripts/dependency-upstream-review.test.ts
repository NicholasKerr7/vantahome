const { createHash } = require('node:crypto');
const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { readReviewedReleaseCatalog, verifyUpstreamAvailability } = require('./dependency-upstream-review');

jest.mock('node:child_process', () => ({ spawnSync: jest.fn() }));

const releases = ['1.0.0', '1.3.0', '1.4.0'];
const reviewed = { version: '1.4.0', versionsHash: createHash('sha256').update(JSON.stringify(releases)).digest('hex') };

/** Model the JSON emitted by the registry command without a network dependency. */
function registryResult(changes: Record<string, unknown> = {}) {
  return { status: 0, stdout: JSON.stringify({ name: 'node-forge', version: '1.4.0', versions: releases, ...changes }) };
}

test('accepts only the complete reviewed release catalog, independent of order', () => {
  expect(readReviewedReleaseCatalog(registryResult(), 'node-forge', reviewed)).toBe('1.4.0');
  expect(readReviewedReleaseCatalog(registryResult({ versions: [...releases].reverse() }), 'node-forge', reviewed)).toBe('1.4.0');
});

test.each(['1.4.1', '1.4.1-beta.0', '1.2.9'])('requires review for any newly published release: %s', (version) => {
  expect(() => readReviewedReleaseCatalog(registryResult({ versions: [...releases, version] }), 'node-forge', reviewed)).toThrow('versions changed');
});

test.each([
  { name: 'another-package' }, { version: '1.4.1' }, { versions: [] }, { versions: null },
  { versions: ['1.4.0'] }, { versions: [...releases, '1.4.0'] }, { versions: [...releases, 42] },
])('fails closed on missing or changed registry evidence: %j', (changes) => {
  expect(() => readReviewedReleaseCatalog(registryResult(changes), 'node-forge', reviewed)).toThrow();
});

test.each([
  { status: 1 }, { status: null, signal: 'SIGTERM' }, { error: new Error('offline') },
  { status: 0, stdout: 'not JSON' }, { status: 0, stdout: 'null' },
])('fails closed when the live registry cannot be verified: %j', (result) => {
  expect(() => readReviewedReleaseCatalog(result, 'node-forge', reviewed)).toThrow();
});

test.each([true, false])('uses a disposable online-only cache even for fixAvailable=%s and removes it after failure', (fixAvailable) => {
  let cachePath: string | undefined;
  spawnSync.mockImplementation((_command: string, args: string[], options: Record<string, unknown>) => {
    expect(args).toEqual(expect.arrayContaining(['--offline=false', '--prefer-offline=false', '--prefer-online', '--registry=https://registry.npmjs.org']));
    cachePath = args.find((argument) => argument.startsWith('--cache='))?.slice('--cache='.length);
    expect(cachePath && existsSync(cachePath)).toBe(true);
    expect(options.timeout).toBe(15000);
    return { status: 1, stderr: 'network unavailable' };
  });
  try {
    expect(() => verifyUpstreamAvailability({ vulnerabilities: { 'node-forge': { fixAvailable } } },
      [{ name: 'node-forge', version: '1.4.0' }])).toThrow('Cannot verify');
    expect(cachePath && existsSync(cachePath)).toBe(false);
  } finally { spawnSync.mockReset(); }
});
