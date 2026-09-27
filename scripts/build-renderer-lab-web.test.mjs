import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRendererLabHtml, LAB_MODEL_NAMES, LAB_CASE_MODELS } from './build-renderer-lab-web.mjs';
import { sha256 } from './build-home-scene.mjs';

/** Create a minimal GLB fixture so packaging failure paths need no large house assets. */
function createGlb(document = { asset: { version: '2.0' } }) {
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

test('offline comparison embeds only its case assets, hashes scripts, and allows no network origin', () => {
  const models = Object.fromEntries(LAB_MODEL_NAMES.map((name) => [name, createGlb()]));
  const html = createRendererLabHtml('window.label="</script>";', 'canvas{display:block}', models);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gu)].map((match) => match[1]);
  assert.equal(scripts.length, 2);
  for (const script of scripts) assert.ok(html.includes(`'sha256-${sha256(script, 'base64')}'`));
  for (const name of LAB_CASE_MODELS.bedroom) assert.ok(scripts[0].includes(`"${name}":"${models[name].toString('base64')}"`));
  for (const name of LAB_CASE_MODELS.property) assert.equal(scripts[0].includes(`"${name}":`), false);
  const property = createRendererLabHtml('', '', models, 'property');
  for (const name of LAB_CASE_MODELS.property) assert.ok(property.includes(`"${name}":"${models[name].toString('base64')}"`));
  for (const name of LAB_CASE_MODELS.bedroom) assert.equal(property.includes(`"${name}":`), false);
  assert.ok(html.includes('connect-src data: blob:'));
  assert.equal(/(?:src|href)="/u.test(html), false);
  assert.equal(html.includes('unsafe-eval'), false);
  assert.equal(html, createRendererLabHtml('window.label="</script>";', 'canvas{display:block}', models));
});

test('packaging rejects external dependencies, missing assets, and stylesheet injection', () => {
  const models = Object.fromEntries(LAB_MODEL_NAMES.map((name) => [name, createGlb()]));
  assert.throws(() => createRendererLabHtml('', '', { ...models, fixtures: undefined }), /Missing renderer/u);
  assert.throws(() => createRendererLabHtml('', '', { ...models, solar: undefined }, 'property'), /Missing renderer comparison model: solar/u);
  assert.throws(() => createRendererLabHtml('', '', models, 'unexpected'), /Unknown renderer/u);
  assert.throws(() => createRendererLabHtml('', '', { ...models, upper: createGlb({ asset: { version: '2.0' }, images: [{ uri: 'https://example.com/texture.png' }] }) }), /external model/u);
  assert.throws(() => createRendererLabHtml('', '</style><script>', models), /closing style/u);
});
