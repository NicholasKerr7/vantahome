import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MODEL_NAMES = ['exterior', 'ground', 'upper', 'landscape', 'gate'];
export const NATIVE_SIZE_LIMIT = 32 * 1024 * 1024;
const MODEL_SIZE_LIMIT = 12 * 1024 * 1024;
const ALL_MODELS_SIZE_LIMIT = 25 * 1024 * 1024;
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Produce content hashes without timestamps, paths, or other machine-specific inputs. */
export function sha256(content, encoding = 'hex') {
  return createHash('sha256').update(content).digest(encoding);
}

/** Prevent bundled JavaScript strings from prematurely closing their HTML script. */
export function escapeScriptContent(source) {
  return source.replace(/<\/script/giu, (closingTag) => closingTag.replace('</', '<\\/'));
}

/** Reject broken GLBs and externally referenced textures or buffers before packaging. */
export function validateGlb(buffer, label) {
  if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'glTF'
    || buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) {
    throw new Error(`${label}: expected a complete GLB version 2 file.`);
  }
  let document;
  let offset = 12;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) throw new Error(`${label}: truncated GLB chunk.`);
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    if (length % 4 || offset + 8 + length > buffer.length) {
      throw new Error(`${label}: invalid GLB chunk length.`);
    }
    if (offset === 12) {
      if (type !== 0x4e4f534a) throw new Error(`${label}: the first GLB chunk must contain JSON.`);
      document = JSON.parse(buffer.toString('utf8', offset + 8, offset + 8 + length).trim());
    }
    offset += length + 8;
  }
  if (!document || document.asset?.version !== '2.0') throw new Error(`${label}: unsupported glTF document.`);
  if ((document.extensionsUsed ?? []).some((name) => ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'].includes(name))) {
    throw new Error(`${label}: compressed exports require a separately packaged decoder; export uncompressed GLB.`);
  }
  for (const item of [...(document.buffers ?? []), ...(document.images ?? [])]) {
    if (item.uri !== undefined && (typeof item.uri !== 'string' || !item.uri.startsWith('data:'))) {
      throw new Error(`${label}: external model resources are not allowed in the offline scene.`);
    }
  }
}

/** Enumerate regular files deterministically; never copy symlinks into shipped assets. */
async function listFiles(directory, prefix = '') {
  const results = [];
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name);
    const entry = await lstat(path);
    const key = prefix ? `${prefix}/${name}` : name;
    if (entry.isSymbolicLink()) throw new Error(`Scene assets must not contain symlinks: ${key}`);
    if (entry.isDirectory()) results.push(...await listFiles(path, key));
    else if (entry.isFile()) results.push(key);
    else throw new Error(`Unexpected scene asset type: ${key}`);
  }
  return results;
}

/** Validate the closed source-asset inventory and enforce an explicit first-release budget. */
async function readModels(sceneRoot) {
  const publicRoot = join(sceneRoot, 'public');
  const expected = new Set([...MODEL_NAMES.map((name) => `models/${name}.glb`), 'models/site-layout.json']);
  const files = await listFiles(publicRoot);
  if (files.length !== expected.size || files.some((file) => !expected.has(file))) {
    throw new Error(`Unexpected or missing public scene assets: ${files.join(', ')}`);
  }
  const models = {};
  let totalBytes = 0;
  for (const name of MODEL_NAMES) {
    const content = await readFile(join(publicRoot, 'models', `${name}.glb`));
    if (content.length > MODEL_SIZE_LIMIT) throw new Error(`${name}.glb exceeds the 12 MiB model budget.`);
    validateGlb(content, `${name}.glb`);
    models[name] = content;
    totalBytes += content.length;
  }
  if (totalBytes > ALL_MODELS_SIZE_LIMIT) throw new Error('The scene exceeds its 25 MiB combined model budget.');
  JSON.parse(await readFile(join(publicRoot, 'models/site-layout.json'), 'utf8'));
  return models;
}

/** Allow weather and local model decoding while blocking unrelated network resources. */
export function contentSecurityPolicy(scriptSources, native = false) {
  return [
    "default-src 'none'",
    `script-src ${scriptSources.join(' ')}`,
    // Three/Drei update generated element transforms and sizes at runtime.
    "style-src 'unsafe-inline'" + (native ? '' : " 'self'"),
    "img-src data: blob:" + (native ? '' : " 'self'"),
    'font-src data:',
    `connect-src ${native ? '' : "'self' "}data: blob: https://api.open-meteo.com`,
    'worker-src blob:',
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');
}

/** Assemble one offline HTML document with content-hashed scripts and embedded model bytes. */
export function createNativeHtml(javascript, css, models) {
  const modelUrls = Object.fromEntries(MODEL_NAMES.map((name) => {
    if (!Buffer.isBuffer(models[name])) throw new Error(`Missing embedded model: ${name}`);
    return [name, `data:model/gltf-binary;base64,${models[name].toString('base64')}`];
  }));
  const bootstrap = escapeScriptContent(`globalThis.__VANTAHOME_EMBEDDED__=true;globalThis.__VANTAHOME_MODEL_URLS=${JSON.stringify(modelUrls)};`);
  const runtime = escapeScriptContent(javascript);
  const policy = contentSecurityPolicy([bootstrap, runtime].map((script) => `'sha256-${sha256(script, 'base64')}'`), true);
  if (/<\/style/iu.test(css)) throw new Error('Unexpected closing style tag in the generated scene stylesheet.');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#101516">
<meta name="color-scheme" content="dark">
<title>VantaHome · 3D Home simulation</title>
<style>${css}</style>
</head><body><div id="root"></div>
<script>${bootstrap}</script>
<script>${runtime}</script>
</body></html>
`;
}

/** Constrain the public web build to the known models and Vite's JS/CSS outputs. */
async function validateWebBuild(webRoot) {
  const files = await listFiles(webRoot);
  const known = new Set(['index.html', 'embedded.html', 'models/site-layout.json', ...MODEL_NAMES.map((name) => `models/${name}.glb`)]);
  const hashes = {};
  for (const file of files) {
    if (!known.has(file) && !/^assets\/[\w.-]+\.(?:js|css)$/u.test(file)) {
      throw new Error(`Unexpected generated web asset: ${file}`);
    }
    const content = await readFile(join(webRoot, file));
    if (file.startsWith('assets/') && content.length > 5 * 1024 * 1024) {
      throw new Error(`Generated scene code exceeds the 5 MiB per-file budget: ${file}`);
    }
    hashes[file] = { bytes: content.length, sha256: sha256(content) };
  }
  for (const file of known) {
    if (!hashes[file]) throw new Error(`Missing generated web asset: ${file}`);
  }
  return hashes;
}

/** Build both targets in a temporary directory, then publish only validated artifacts. */
export async function buildHomeScene(projectRoot = PROJECT_ROOT) {
  const sceneRoot = join(projectRoot, 'packages/home-scene');
  const models = await readModels(sceneRoot);
  const require = createRequire(join(sceneRoot, 'package.json'));
  const { build } = await import(pathToFileURL(require.resolve('vite')).href);
  const scratch = await mkdtemp(join(tmpdir(), 'vantahome-scene-'));
  try {
    const webRoot = join(scratch, 'web');
    const nativeRoot = join(scratch, 'native');
    const options = { root: sceneRoot, configFile: join(sceneRoot, 'vite.config.ts') };
    await build({ ...options, mode: 'production', build: { outDir: webRoot, emptyOutDir: true } });
    await build({ ...options, mode: 'native', build: { outDir: nativeRoot, emptyOutDir: true } });
    const nativeFiles = await listFiles(nativeRoot);
    if (nativeFiles.join(',') !== 'scene.css,scene.js') {
      throw new Error(`Native scene must be self-contained; unexpected output: ${nativeFiles.join(', ')}`);
    }
    const [javascript, css, webIndex] = await Promise.all([
      readFile(join(nativeRoot, 'scene.js'), 'utf8'),
      readFile(join(nativeRoot, 'scene.css'), 'utf8'),
      readFile(join(webRoot, 'index.html'), 'utf8'),
    ]);
    if (!webIndex.includes('<head>')) throw new Error('The scene web entry point has no document head.');
    await writeFile(join(webRoot, 'index.html'), webIndex.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(["'self'"])}">`));
    const html = createNativeHtml(javascript, css, models);
    const nativeBytes = Buffer.byteLength(html);
    if (nativeBytes > NATIVE_SIZE_LIMIT) throw new Error(`Native scene exceeds its 32 MiB budget (${nativeBytes} bytes).`);
    // The sandboxed web iframe has an opaque origin; inline model bytes avoid CORS
    // exceptions without granting it access to the host app's DOM or local storage.
    await writeFile(join(webRoot, 'embedded.html'), html);
    const manifest = {
      formatVersion: 1,
      native: { file: 'scene.vhscene', bytes: nativeBytes, sha256: sha256(html) },
      models: Object.fromEntries(MODEL_NAMES.map((name) => [name, { bytes: models[name].length, sha256: sha256(models[name]) }])),
      web: await validateWebBuild(webRoot),
    };
    const nativeOutput = join(projectRoot, 'assets/home-scene');
    const generatedOutput = join(projectRoot, 'src/features/three-d-home/generated');
    const webOutput = join(projectRoot, 'public/home-scene');
    await mkdir(nativeOutput, { recursive: true });
    await mkdir(generatedOutput, { recursive: true });
    await rm(webOutput, { recursive: true, force: true });
    await cp(webRoot, webOutput, { recursive: true });
    await writeFile(join(nativeOutput, 'scene.vhscene'), html);
    await writeFile(join(generatedOutput, 'sceneManifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(join(generatedOutput, 'sceneAsset.ts'), `// Generated by scripts/build-home-scene.mjs; do not edit.\n/** Offline scene asset loaded by Expo Asset, never passed as a giant HTML prop. */\nexport const HOME_SCENE_ASSET: number = require('../../../../assets/home-scene/scene.vhscene');\nexport const HOME_SCENE_BUNDLE_SHA256 = '${manifest.native.sha256}';\nexport const HOME_SCENE_BUNDLE_BYTES = ${nativeBytes};\n`);
    console.info(`3D Home built: ${relative(projectRoot, webOutput)} and ${(nativeBytes / 1024 / 1024).toFixed(1)} MiB offline native scene (${manifest.native.sha256.slice(0, 12)}).`);
    return manifest;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildHomeScene().catch((error) => {
    console.error(`Cannot package 3D Home: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
