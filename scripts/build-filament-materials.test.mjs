import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { inspectMaterial, sha256 } from './build-filament-materials.mjs';

/** Build a small package chunk to exercise native compatibility checks without a compiler. */
function chunk(name, bytes) {
  const header = Buffer.alloc(12);
  header.write(name.split('').reverse().join(''), 'ascii');
  header.writeUInt32LE(bytes.length, 8);
  return Buffer.concat([header, bytes]);
}

test('both committed materials match their source hashes and contain every mobile backend', async () => {
  const base = new URL('../assets/renderer-lab/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('filament-materials.json', base), 'utf8'));
  for (const name of ['filament-water', 'filament-wet']) {
    const source = await readFile(new URL(`materials/${name}.mat`, base));
    const binary = await readFile(new URL(`${name}.filamat`, base));
    assert.equal(sha256(source), manifest.materials[name].sourceSha256);
    assert.equal(sha256(binary), manifest.materials[name].binarySha256);
    assert.deepEqual(inspectMaterial(binary), { version: 68, backends: ['opengl', 'vulkan', 'metal'] });
  }
});

test('reject incompatible material versions before the native renderer loads them', () => {
  assert.throws(() => inspectMaterial(chunk('MAT_VERS', Buffer.from([67, 0, 0, 0]))), /format 68/);
});

test('reject a mobile material missing Metal, and truncated chunks', () => {
  const version = chunk('MAT_VERS', Buffer.from([68, 0, 0, 0]));
  assert.throws(() => inspectMaterial(Buffer.concat([version, chunk('MAT_GLSL', Buffer.from('shader'))])), /MAT_METL/);
  assert.throws(() => inspectMaterial(version.subarray(0, 14)), /Truncated/);
});
