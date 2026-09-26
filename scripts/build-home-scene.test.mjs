import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODEL_NAMES, contentSecurityPolicy, createNativeHtml, escapeScriptContent, sha256, validateGlb } from './build-home-scene.mjs';

/** Construct a minimal valid GLB to exercise the packaging boundary without large fixtures. */
function glb(document) {
  const json = JSON.stringify(document);
  const padded = json.padEnd(Math.ceil(Buffer.byteLength(json) / 4) * 4, ' ');
  const bytes = Buffer.alloc(20 + Buffer.byteLength(padded));
  bytes.write('glTF');
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(Buffer.byteLength(padded), 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  bytes.write(padded, 20);
  return bytes;
}

test('validates complete self-contained version 2 model files', () => {
  assert.doesNotThrow(() => validateGlb(glb({ asset: { version: '2.0' }, images: [{ uri: 'data:image/png;base64,AAAA' }] }), 'model'));
  assert.throws(() => validateGlb(Buffer.from('glTF'), 'model'), /complete GLB/u);
  const truncated = glb({ asset: { version: '2.0' } });
  truncated.writeUInt32LE(truncated.length + 4, 8);
  assert.throws(() => validateGlb(truncated, 'model'), /complete GLB/u);
});

test('rejects model dependencies that would bypass offline packaging', () => {
  for (const extension of ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu']) {
    assert.throws(() => validateGlb(glb({ asset: { version: '2.0' }, extensionsUsed: [extension] }), 'model'), /compressed exports/u);
  }
  for (const uri of ['https://example.com/texture.png', '../texture.png', 'file:///tmp/model.bin']) {
    assert.throws(() => validateGlb(glb({ asset: { version: '2.0' }, images: [{ uri }] }), 'model'), /external model resources/u);
  }
  assert.throws(() => validateGlb(glb({ asset: { version: '2.0' }, buffers: [{ uri: 'model.bin' }] }), 'model'), /external model resources/u);
});

test('escapes closing script text without changing case or embedded string values', () => {
  const source = 'globalThis.sample="</script><script>alert(1)</script>";';
  const escaped = escapeScriptContent(source);
  assert.equal(escaped.includes('</script'), false);
  assert.equal(escaped, 'globalThis.sample="<\\/script><script>alert(1)<\\/script>";');
  assert.equal(escapeScriptContent('"</ScRiPt>"'), '"<\\/ScRiPt>"');
});

test('native HTML contains only content-hashed scripts and every embedded model', () => {
  const bytes = glb({ asset: { version: '2.0' } });
  const models = Object.fromEntries(MODEL_NAMES.map((name) => [name, bytes]));
  const html = createNativeHtml('globalThis.sample="</script>";', 'body{color:white}', models);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gu)].map((match) => match[1]);
  assert.equal(scripts.length, 2);
  assert.equal(html.includes('globalThis.__VANTAHOME_EMBEDDED__=true'), true);
  for (const script of scripts) assert.ok(html.includes(`'sha256-${sha256(script, 'base64')}'`));
  for (const name of MODEL_NAMES) assert.ok(html.includes(`"${name}":"data:model/gltf-binary;base64,`));
  assert.equal(html.includes('src="'), false);
  assert.equal(html.includes('localhost'), false);
  assert.equal(html, createNativeHtml('globalThis.sample="</script>";', 'body{color:white}', models));
});

test('native packaging rejects missing models and hostile closing style sequences', () => {
  assert.throws(() => createNativeHtml('', '', {}), /Missing embedded model/u);
  const models = Object.fromEntries(MODEL_NAMES.map((name) => [name, Buffer.from('fixture')]));
  assert.throws(() => createNativeHtml('', '</style><script>', models), /closing style tag/u);
});

test('CSP permits only local resource decoding and the known weather provider', () => {
  const native = contentSecurityPolicy(["'sha256-example'"], true);
  assert.ok(native.includes('connect-src data: blob: https://api.open-meteo.com'));
  assert.ok(native.includes("default-src 'none'"));
  assert.equal(native.includes('unsafe-eval'), false);
  assert.equal(native.includes("script-src 'unsafe-inline'"), false);
  assert.equal(native.includes("'self'"), false);
  assert.ok(contentSecurityPolicy(["'self'"]).includes("connect-src 'self' data: blob: https://api.open-meteo.com"));
});
