import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { escapeScriptContent, sha256, validateGlb } from './build-home-scene.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LAB_MODEL_NAMES = ['upper', 'exterior', 'landscape', 'gate', 'fixtures', 'solar', 'rain'];
export const LAB_CASE_MODELS = { bedroom: ['upper', 'fixtures'], property: ['exterior', 'landscape', 'gate', 'solar', 'rain'] };
const MAX_BUNDLE_BYTES = 32 * 1024 * 1024;

/** Package audited GLBs and compiled code into a network-independent comparison document. */
export function createRendererLabHtml(javascript, css, models, view = 'bedroom') {
  const names = LAB_CASE_MODELS[view];
  if (!names) throw new Error('Unknown renderer comparison case.');
  const encoded = {};
  for (const name of names) {
    const model = models[name];
    if (!Buffer.isBuffer(model)) throw new Error(`Missing renderer comparison model: ${name}`);
    validateGlb(model, `${name}.glb`);
    encoded[name] = model.toString('base64');
  }
  const bootstrap = escapeScriptContent(`window.__VANTA_LAB_INITIAL_VIEW__=${JSON.stringify(view)};window.__VANTA_LAB_MODELS__=${JSON.stringify(encoded)};`);
  const runtime = escapeScriptContent(javascript);
  if (/<\/style/iu.test(css)) throw new Error('Unexpected closing style tag in the comparison stylesheet.');
  const scriptHashes = [bootstrap, runtime].map((script) => `'sha256-${sha256(script, 'base64')}'`).join(' ');
  const policy = [
    "default-src 'none'", `script-src ${scriptHashes}`,
    // OrbitControls manages its generated canvas touch-action attribute.
    "style-src 'unsafe-inline'", 'img-src data: blob:', 'connect-src data: blob:',
    "base-uri 'none'", "form-action 'none'", "object-src 'none'",
  ].join('; ');
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#d9e6e5">
<title>VantaHome · Renderer comparison</title>
<style>${css}</style>
</head><body><main id="scene"></main><p id="status" role="status">Preparing house comparison…</p>
<script>${bootstrap}</script><script>${runtime}</script>
</body></html>\n`;
  if (Buffer.byteLength(html) > MAX_BUNDLE_BYTES) throw new Error('The renderer comparison exceeds its 32 MiB offline bundle budget.');
  return html;
}

/** Build one isolated IIFE and publish identical bytes for native WebView and web iframe. */
export async function buildRendererLabWeb(projectRoot = PROJECT_ROOT) {
  const sceneRoot = join(projectRoot, 'packages/home-scene');
  const require = createRequire(join(sceneRoot, 'package.json'));
  const { build } = await import(pathToFileURL(require.resolve('vite')).href);
  const models = Object.fromEntries(await Promise.all(LAB_MODEL_NAMES.map(async (name) => {
    const folder = ['fixtures', 'solar', 'rain'].includes(name) ? join(projectRoot, 'assets/renderer-lab') : join(sceneRoot, 'public/models');
    return [name, await readFile(join(folder, `${name}.glb`))];
  })));
  const scratch = await mkdtemp(join(tmpdir(), 'vantahome-renderer-lab-'));
  try {
    await build({
      root: sceneRoot,
      configFile: false,
      publicDir: false,
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      build: {
        outDir: scratch, emptyOutDir: true, cssCodeSplit: false,
        assetsInlineLimit: Number.MAX_SAFE_INTEGER,
        lib: {
          entry: join(sceneRoot, 'src/renderer-lab/main.ts'),
          name: 'VantaRendererLab', formats: ['iife'],
          fileName: () => 'comparison.js', cssFileName: 'comparison',
        },
        rollupOptions: { output: { inlineDynamicImports: true } },
      },
    });
    const files = (await readdir(scratch)).sort();
    if (files.join(',') !== 'comparison.css,comparison.js') {
      throw new Error(`Unexpected renderer comparison outputs: ${files.join(', ')}`);
    }
    const [javascript, css] = await Promise.all([
      readFile(join(scratch, 'comparison.js'), 'utf8'),
      readFile(join(scratch, 'comparison.css'), 'utf8'),
    ]);
    const nativeFolder = join(projectRoot, 'assets/renderer-lab');
    const webFolder = join(projectRoot, 'public/renderer-lab');
    await mkdir(nativeFolder, { recursive: true });
    await mkdir(webFolder, { recursive: true });
    const result = {};
    for (const view of Object.keys(LAB_CASE_MODELS)) {
      const html = createRendererLabHtml(javascript, css, models, view);
      await writeFile(join(nativeFolder, `comparison-${view}.vhscene`), html);
      await writeFile(join(webFolder, `${view}.html`), html);
      result[view] = { bytes: Buffer.byteLength(html), sha256: sha256(html) };
      console.info(`Renderer ${view} comparison built: ${(result[view].bytes / 1024 / 1024).toFixed(1)} MiB offline (${result[view].sha256.slice(0, 12)}).`);
    }
    // Remove the obsolete combined documents generated by the first prototype.
    await rm(join(nativeFolder, 'comparison.vhscene'), { force: true });
    await rm(join(webFolder, 'index.html'), { force: true });
    return result;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildRendererLabWeb().catch((error) => {
    console.error(`Cannot package renderer comparison: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
