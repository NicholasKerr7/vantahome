import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const { patchVoice, ORIGINALS } = require('./patch-voice-recognition.js');
const sourceRoot = path.dirname(require.resolve('@react-native-voice/voice/package.json'));

test('reviewed patch is idempotent and refuses source drift without modifying other files', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'vanta-voice-patch-'));
  try {
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '3.2.4' }));
    for (const name of Object.keys(ORIGINALS)) {
      mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      writeFileSync(path.join(root, name), readFileSync(path.join(sourceRoot, name)));
    }
    patchVoice(true, root); patchVoice(false, root); patchVoice(true, root);
    const native = readFileSync(path.join(root, 'ios/Voice/Voice.m'), 'utf8');
    writeFileSync(path.join(root, 'dist/index.js'), 'unreviewed upstream change');
    assert.throws(() => patchVoice(false, root), /Unreviewed Voice source/);
    assert.equal(readFileSync(path.join(root, 'ios/Voice/Voice.m'), 'utf8'), native);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const modern of [true, false]) test(`iOS vocabulary adapter preserves the correct native calling convention (modern=${modern})`, async () => {
  const calls = [];
  const native = { startSpeech: (...args) => { calls.push(args); args.at(-1)(null); } };
  if (modern) native.startSpeechWithOptions = native.startSpeech;
  const exports = {};
  vm.runInNewContext(readFileSync(path.join(sourceRoot, 'dist/index.js'), 'utf8'), {
    exports, require: (name) => name === 'react-native'
      ? { NativeModules: { Voice: native }, Platform: { OS: 'ios' }, NativeEventEmitter: class { addListener() { return { remove() {} }; } } }
      : { default: () => {} },
  });
  const options = { contextualStrings: ['Vanta', 'Primary suite'] };
  await exports.default.start('en-US', options);
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'en-US');
  assert.equal(calls[0].length, modern ? 3 : 2);
  if (modern) assert.equal(calls[0][1], options);
});
