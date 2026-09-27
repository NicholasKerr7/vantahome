import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIRECTORY = join(ROOT, 'assets/renderer-lab');
const NAMES = ['filament-water', 'filament-wet'];
const OPTIONS = ['-p', 'mobile', '-a', 'all', '-S', '-V',
  'directionalLighting,dynamicLighting,shadowReceiver,skinning,vsm,fog,ssr,stereo'];
const FORMAT = 68;

/** Hash both source and compiled bytes so stale shaders fail before a native build. */
export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Read the public Filament package chunk layout, rejecting truncation or wrong backends. */
export function inspectMaterial(bytes) {
  const chunks = new Map();
  for (let offset = 0; offset < bytes.length;) {
    if (offset + 12 > bytes.length) throw new Error('Truncated Filament material header.');
    const name = bytes.subarray(offset, offset + 8).toString('ascii').split('').reverse().join('');
    const length = bytes.readUInt32LE(offset + 8);
    offset += 12;
    if (offset + length > bytes.length) throw new Error(`Truncated Filament material chunk: ${name}.`);
    chunks.set(name, bytes.subarray(offset, offset + length));
    offset += length;
  }
  const version = chunks.get('MAT_VERS');
  if (!version || version.length !== 4 || version.readUInt32LE() !== FORMAT) {
    throw new Error(`Native rain requires Filament material format ${FORMAT}.`);
  }
  for (const name of ['MAT_GLSL', 'MAT_METL', 'MAT_SPIR']) {
    if (!chunks.get(name)?.length) throw new Error(`Filament material is missing ${name} shaders.`);
  }
  return { version: FORMAT, backends: ['opengl', 'vulkan', 'metal'] };
}

/** Check both installed native platforms; a library upgrade must not silently ship stale shaders. */
async function verifyRuntimeFormat() {
  for (const platform of ['ios', 'android']) {
    const header = await readFile(join(ROOT,
      `node_modules/react-native-filament/${platform}/libs/filament/include/filament/MaterialEnums.h`), 'utf8');
    const version = Number(header.match(/MATERIAL_VERSION\s*=\s*(\d+)/)?.[1]);
    if (version !== FORMAT) throw new Error(`Filament ${platform} uses format ${version}; rebuild the rain materials for that SDK.`);
  }
}

/** Verify committed offline binaries without requiring the compiler on every developer machine. */
async function check() {
  await verifyRuntimeFormat();
  const manifest = JSON.parse(await readFile(join(DIRECTORY, 'filament-materials.json'), 'utf8'));
  if (manifest.materialVersion !== FORMAT) throw new Error('Unexpected native material manifest version.');
  for (const name of NAMES) {
    const source = await readFile(join(DIRECTORY, 'materials', `${name}.mat`));
    const binary = await readFile(join(DIRECTORY, `${name}.filamat`));
    inspectMaterial(binary);
    if (manifest.materials[name]?.sourceSha256 !== sha256(source)
      || manifest.materials[name]?.binarySha256 !== sha256(binary)) {
      throw new Error(`${name} is stale or modified. Run npm run build:filament-materials with FILAMENT_MATC set.`);
    }
  }
}

/** Compile trusted project sources with a matching matc, validating all outputs before publishing. */
async function compile() {
  await verifyRuntimeFormat();
  const compiler = process.env.FILAMENT_MATC || 'matc';
  const version = Number(execFileSync(compiler, ['--version'], { encoding: 'utf8' }).trim());
  if (version !== FORMAT) throw new Error(`matc format ${version} cannot target the installed format ${FORMAT}.`);
  const temporary = await mkdtemp(join(tmpdir(), 'vanta-materials-'));
  try {
    const artifacts = [];
    for (const name of NAMES) {
      const sourcePath = join(DIRECTORY, 'materials', `${name}.mat`);
      const output = join(temporary, `${name}.filamat`);
      execFileSync(compiler, [...OPTIONS, '-o', output, sourcePath], { stdio: 'pipe' });
      const binary = await readFile(output);
      inspectMaterial(binary);
      artifacts.push({ name, binary, source: await readFile(sourcePath) });
    }
    const manifest = {
      compilerRelease: '1.68.3', materialVersion: FORMAT,
      backends: ['opengl', 'vulkan', 'metal'],
      materials: Object.fromEntries(artifacts.map(({ name, source, binary }) => [name, {
        sourceSha256: sha256(source), binarySha256: sha256(binary), bytes: binary.length,
      }])),
    };
    for (const { name, binary } of artifacts) await writeFile(join(DIRECTORY, `${name}.filamat`), binary);
    await writeFile(join(DIRECTORY, 'filament-materials.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--check')) await check();
    else await compile();
    console.info('Filament water materials verified for Metal, Vulkan and OpenGL (format 68).');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
