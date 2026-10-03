import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

jest.mock('./security-patches/braces', () => ({
  name: 'braces', version: '3.0.3', advisory: 'GHSA-vfj7-8cjw-p6xm',
  files: [{ path: 'index.js',
    originalHash: require('node:crypto').createHash('sha256').update('original braces').digest('hex'),
    patchedHash: require('node:crypto').createHash('sha256').update('patched braces').digest('hex'),
    patch: (source: string) => source.replace('original', 'patched'),
  }],
}));
jest.mock('./security-patches/node-forge', () => ({
  name: 'node-forge', version: '1.4.0', advisory: 'GHSA-86w9-cpqp-85rv',
  files: [{ path: 'index.js',
    originalHash: require('node:crypto').createHash('sha256').update('original node-forge').digest('hex'),
    patchedHash: require('node:crypto').createHash('sha256').update('patched node-forge').digest('hex'),
    patch: (source: string) => source.replace('original', 'patched'),
  }],
}));
const { ensureSecurityPatches, sha256 } = require('./patch-security-dependencies');
let root: string;
let packages: Record<string, { version: string }>;

/** Write a physical dependency and optionally record it in the isolated lockfile. */
function addPackage(name: string, node = `node_modules/${name}`, locked = true): void {
  const version = name === 'braces' ? '3.0.3' : '1.4.0';
  const directory = path.join(root, node);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name, version }));
  writeFileSync(path.join(directory, 'index.js'), `original ${name}`);
  if (locked) packages[node] = { version };
  writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages }));
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'vantahome-patch-unit-'));
  packages = {};
  addPackage('braces');
  addPackage('node-forge');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test('applies reviewed sources, checks all copies, and is idempotent', () => {
  addPackage('braces', 'node_modules/parent/node_modules/braces');
  const expected = ensureSecurityPatches({ root });
  expect(expected[0].nodes).toHaveLength(2);
  expect(readFileSync(path.join(root, 'node_modules/braces/index.js'), 'utf8')).toBe('patched braces');
  expect(ensureSecurityPatches({ root, checkOnly: true })).toEqual(expected);
  expect(ensureSecurityPatches({ root })).toEqual(expected);
  expect(sha256('patched braces')).toBe(createHash('sha256').update('patched braces').digest('hex'));
});

test('check-only rejects an unpatched install without modifying it', () => {
  expect(() => ensureSecurityPatches({ root, checkOnly: true })).toThrow('patches are missing');
  expect(readFileSync(path.join(root, 'node_modules/braces/index.js'), 'utf8')).toBe('original braces');
});

test('checks every package before writing any patch', () => {
  writeFileSync(path.join(root, 'node_modules/node-forge/index.js'), 'unexpected code');
  expect(() => ensureSecurityPatches({ root })).toThrow('Unexpected security source');
  expect(readFileSync(path.join(root, 'node_modules/braces/index.js'), 'utf8')).toBe('original braces');
});

test('rejects a changed installed or locked version', () => {
  writeFileSync(path.join(root, 'node_modules/braces/package.json'), JSON.stringify({ name: 'braces', version: '3.0.4' }));
  expect(() => ensureSecurityPatches({ root })).toThrow('Unexpected braces version');
  addPackage('braces');
  packages['node_modules/braces'].version = '3.0.4';
  writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages }));
  expect(() => ensureSecurityPatches({ root })).toThrow('Unexpected braces version');
});

test('rejects extra unlocked copies and missing locked copies', () => {
  addPackage('braces', 'node_modules/extra/node_modules/braces', false);
  expect(() => ensureSecurityPatches({ root })).toThrow('do not match the lockfile');
  rmSync(path.join(root, 'node_modules/extra'), { recursive: true });
  rmSync(path.join(root, 'node_modules/braces'), { recursive: true });
  expect(() => ensureSecurityPatches({ root })).toThrow('do not match the lockfile');
});

test('rejects linked dependencies and linked source files', () => {
  const filename = path.join(root, 'node_modules/braces/index.js');
  const target = path.join(root, 'original.js');
  writeFileSync(target, 'original braces');
  rmSync(filename);
  symlinkSync(target, filename);
  expect(() => ensureSecurityPatches({ root })).toThrow('Linked security source');
  rmSync(path.join(root, 'node_modules/braces'), { recursive: true });
  symlinkSync(path.join(root, 'node_modules/node-forge'), path.join(root, 'node_modules/braces'), 'dir');
  expect(() => ensureSecurityPatches({ root })).toThrow('Linked security dependency');
});

test('rejects source tampering even after successful installation', () => {
  ensureSecurityPatches({ root });
  const filename = path.join(root, 'node_modules/braces/index.js');
  writeFileSync(filename, `${readFileSync(filename, 'utf8')} // changed`);
  expect(() => ensureSecurityPatches({ root, checkOnly: true })).toThrow('Unexpected security source');
});

test('rejects transforms whose output does not match the reviewed hash', () => {
  const file = jest.requireMock('./security-patches/braces').files[0];
  const original = file.patch;
  file.patch = () => 'incorrect patch';
  try { expect(() => ensureSecurityPatches({ root })).toThrow('output mismatch'); }
  finally { file.patch = original; }
});

test('rejects unknown lockfile formats', () => {
  writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 2, packages }));
  expect(() => ensureSecurityPatches({ root })).toThrow('Unsupported lockfile');
});
