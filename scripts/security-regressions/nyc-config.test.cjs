'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { installedCopies } = require('../patch-security-dependencies');

const root = path.resolve(__dirname, '../..');
// Resolve through Jest's actual instrumentation chain, not an unrelated YAML copy.
const requireFromJest = createRequire(require.resolve('babel-jest'));
const pluginPath = requireFromJest.resolve('babel-plugin-istanbul');
const requireFromPlugin = createRequire(pluginPath);
const loaderPath = requireFromPlugin.resolve('@istanbuljs/load-nyc-config');
const requireFromLoader = createRequire(loaderPath);
const { loadNycConfig, isLoading } = require(loaderPath);

/** Create an isolated coverage project and remove only its temporary fixture on completion. */
function coverageFixture(t, files) {
  const directory = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'vantahome-nyc-security-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'coverage-fixture', nyc: { all: true } }));
  for (const [name, source] of Object.entries(files)) writeFileSync(path.join(directory, name), source);
  return directory;
}

test('the installed and locked coverage tree cannot reintroduce vulnerable sprintf-js', () => {
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.deepEqual(Object.keys(lock.packages).filter((name) => name.endsWith('node_modules/sprintf-js')), []);
  assert.deepEqual(installedCopies(root, ['sprintf-js']).get('sprintf-js'), []);
  assert.equal(requireFromLoader('js-yaml/package.json').version, '4.3.2');
  const requireFromYaml = createRequire(requireFromLoader.resolve('js-yaml'));
  assert.equal(requireFromYaml('argparse/package.json').version, '2.0.1');
});

test('real nyc YAML loading preserves ordinary settings, aliases and literal format-like text', async (t) => {
  const directory = coverageFixture(t, { '.nycrc.yml': [
    'check-coverage: true', 'lines: 85', 'branches: 72.5',
    'include: &sources ["src/**/*.js", "src/**/*.ts"]', 'exclude: ["src/generated/**"]',
    'extension: .ts', 'require: ./setup.cjs', 'reporter: [text, json-summary]',
    'custom-paths: *sources', 'report-dir: "coverage/%.101f-%.0g"',
  ].join('\n') });
  assert.deepEqual(await loadNycConfig({ cwd: directory }), {
    cwd: directory, all: true, checkCoverage: true, lines: 85, branches: 72.5,
    include: ['src/**/*.js', 'src/**/*.ts'], exclude: ['src/generated/**'],
    extension: ['.ts'], require: ['./setup.cjs'], reporter: ['text', 'json-summary'],
    customPaths: ['src/**/*.js', 'src/**/*.ts'], reportDir: 'coverage/%.101f-%.0g',
  });
});

test('real nyc loading retains YAML, JSON and CommonJS extends and relative cwd semantics', async (t) => {
  const directory = coverageFixture(t, {
    '.nycrc.yaml': 'extends: ["./base.yml", "./extra.json", "./settings.cjs"]\ninclude: src/**/*.js\n',
    'base.yml': 'cwd: ./source\ncheck-coverage: true\nexclude: generated/**\n',
    'extra.json': JSON.stringify({ extension: '.js', lines: 90 }),
    'settings.cjs': 'module.exports = { reporter: ["text", "json"] };',
  });
  assert.deepEqual(await loadNycConfig({ cwd: directory }), {
    cwd: path.join(directory, 'source'), all: true, include: ['src/**/*.js'],
    checkCoverage: true, exclude: ['generated/**'], extension: ['.js'], lines: 90,
    reporter: ['text', 'json'],
  });
});

test('coverage YAML rejects executable tags and malformed documents without poisoning later loads', async (t) => {
  const directory = coverageFixture(t, { '.nycrc.yml': '' });
  const filename = path.join(directory, '.nycrc.yml');
  for (const tag of ['!!js/function "function () {}"', '!!js/regexp /unsafe/', '!!js/undefined ""']) {
    writeFileSync(filename, `reporter: ${tag}\n`);
    await assert.rejects(loadNycConfig({ cwd: directory }), /unknown tag/);
    assert.equal(isLoading(), false);
  }
  for (const source of ['include: [unterminated', 'lines: 80\nlines: 90\n']) {
    writeFileSync(filename, source);
    await assert.rejects(loadNycConfig({ cwd: directory }), /flow collection|duplicated mapping key/);
    assert.equal(isLoading(), false);
  }
  writeFileSync(filename, 'lines: 85\n');
  assert.equal((await loadNycConfig({ cwd: directory })).lines, 85);
});

test('coverage YAML still rejects circular and invalid extends', async (t) => {
  const directory = coverageFixture(t, {
    '.nycrc.yml': 'extends: ./loop.yml\n',
    'loop.yml': 'extends: ./.nycrc.yml\n',
    'invalid.yml': 'extends: [42]\n',
  });
  await assert.rejects(loadNycConfig({ cwd: directory }), /Circular extended configurations/);
  await assert.rejects(loadNycConfig({ cwd: directory, nycrcPath: 'invalid.yml' }), /invalid 'extends'/);
});

test('Jest Babel instrumentation consumes YAML settings and records real branch coverage', (t) => {
  const directory = coverageFixture(t, {
    '.nycrc.yml': 'include: ["*.js"]\nexclude: ["ignored.js"]\nextension: [.js]\n',
  });
  const { transformSync } = requireFromJest('@babel/core');
  const source = 'module.exports = function (level) { return level > 0 ? "on" : "off"; };';
  /** Transform through the real plugin and its synchronous config-loader subprocess. */
  const transform = (name) => transformSync(source, {
    filename: path.join(directory, name), configFile: false, babelrc: false,
    plugins: [[pluginPath, { cwd: directory }]],
  }).code;
  const context = { module: { exports: {} } };
  vm.runInNewContext(transform('included.js'), context, { timeout: 1000 });
  assert.equal(context.module.exports(1), 'on');
  assert.equal(context.module.exports(0), 'off');
  const coverage = context.__coverage__[path.join(directory, 'included.js')];
  assert.ok(coverage && Object.keys(coverage.b).length > 0);
  assert.ok(Object.values(coverage.b).flat().every((hits) => hits > 0));
  assert.doesNotMatch(transform('ignored.js'), /__coverage__/);
});

test('the upgraded YAML CLI retains normal argument parsing without sprintf-js', (t) => {
  const directory = coverageFixture(t, { 'config.yml': 'lines: 85\nreporter: [text, json]\n' });
  const cli = path.join(path.dirname(requireFromLoader.resolve('js-yaml')), 'bin/js-yaml.js');
  const result = spawnSync(process.execPath, [cli, path.join(directory, 'config.yml')], {
    encoding: 'utf8', timeout: 3000, maxBuffer: 64 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { lines: 85, reporter: ['text', 'json'] });
});
