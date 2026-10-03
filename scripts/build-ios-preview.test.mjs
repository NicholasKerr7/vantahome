import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const scriptPath = fileURLToPath(new URL('./build-ios-preview.py', import.meta.url));
const bootstrap = String.raw`
import base64, importlib.util, json, os, pathlib, plistlib, signal, subprocess, sys, tempfile
from unittest.mock import patch
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('preview_build', sys.argv[1])
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)
identity = {'displayName':'VantaHome Preview','scheme':'vantahome-preview','bundleIdentifier':'com.anonymous.vantahome.preview'}
def original_metadata():
    """Minimal consistent production sources keep signing tests isolated from the checkout."""
    return {
      'app.json': json.dumps({'expo':{'name':'VantaHome','scheme':'vantahome','version':'1.0.0',
          'ios':{'bundleIdentifier':'com.anonymous.vantahome','buildNumber':'1'},
          'android':{'package':'com.anonymous.vantahome'}}}).encode(),
      'ios/vantahome/Info.plist': plistlib.dumps({'CFBundleDisplayName':'VantaHome','CFBundleVersion':'1',
          'CFBundleIdentifier':'$(PRODUCT_BUNDLE_IDENTIFIER)','CFBundleURLTypes':[{'CFBundleURLSchemes':['vantahome']}] }),
      'ios/vantahome.xcodeproj/project.pbxproj': b'PRODUCT_BUNDLE_IDENTIFIER = com.anonymous.vantahome;\nCURRENT_PROJECT_VERSION = 1;\nPRODUCT_BUNDLE_IDENTIFIER = com.anonymous.vantahome;\nCURRENT_PROJECT_VERSION = 1;\n',
    }
def public_environment(key='sb_publishable_synthetic_fixture'):
    """Provide public-only fixture configuration, never real credentials."""
    return {'EXPO_PUBLIC_APP_VARIANT':'preview','EXPO_PUBLIC_VANTA_MODE':'development',
      'EXPO_PUBLIC_SUPABASE_URL':preview.STAGING_URL,'EXPO_PUBLIC_SUPABASE_ANON_KEY':key}
def encoded_key(role='anon', ref='dcevusczjtmdpzrxpdou'):
    """Construct an unsigned test payload solely for checking role/ref parsing."""
    return 'fixture.' + base64.urlsafe_b64encode(json.dumps({'role':role,'ref':ref}).encode()).decode().rstrip('=') + '.fixture'
def write_environment(root, values):
    """Keep generated environment fixtures outside tracked files."""
    filename = root / 'preview.env'
    filename.write_text('\n'.join(key+'='+value for key,value in values.items()))
    return filename
`;

/** Execute pure packaging logic against temporary fixtures without invoking Xcode or editing app metadata. */
function runPython(source) {
  const result = spawnSync('python3', ['-c', bootstrap + '\n' + source, scriptPath], {
    encoding: 'utf8', timeout: 15_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
}

test('preview environment accepts only explicit staging development public credentials', () => {
  runPython(String.raw`
with tempfile.TemporaryDirectory() as folder:
    root = pathlib.Path(folder)
    for key in ['sb_publishable_synthetic_fixture', encoded_key()]:
        values = public_environment(key)
        assert preview.read_preview_environment(write_environment(root, values)) == values
`);
});

test('preview environment rejects privileged keys, wrong projects, unknown settings and duplicates', () => {
  runPython(String.raw`
with tempfile.TemporaryDirectory() as folder:
    root = pathlib.Path(folder)
    invalid = [public_environment(encoded_key('service_role')), public_environment(encoded_key(ref='another-project')),
      public_environment('malformed'), {**public_environment(), 'EXPO_PUBLIC_VANTA_MODE':'production'},
      {**public_environment(), 'EXPO_PUBLIC_APP_VARIANT':'production'},
      {**public_environment(), 'EXPO_PUBLIC_SUPABASE_URL':'https://production.invalid'},
      {**public_environment(), 'SUPABASE_SERVICE_ROLE_KEY':'synthetic-rejected-value'},
      {**public_environment(), 'EXPO_PUBLIC_UNREVIEWED':'synthetic-rejected-value'}]
    for values in invalid:
        try: preview.read_preview_environment(write_environment(root, values))
        except ValueError: pass
        else: raise AssertionError('Unsafe preview environment was accepted')
    filename = write_environment(root, public_environment())
    filename.write_text(filename.read_text()+'\nEXPO_PUBLIC_VANTA_MODE=development')
    try: preview.read_preview_environment(filename)
    except ValueError: pass
    else: raise AssertionError('Duplicate setting was accepted')
`);
});

test('preview metadata matches the isolated identity and preserves production inputs byte-for-byte', () => {
  runPython(String.raw`
originals = original_metadata()
before = dict(originals)
result = preview.preview_metadata(originals, identity, 42)
assert originals == before
config = json.loads(result['app.json'])['expo']
info = plistlib.loads(result['ios/vantahome/Info.plist'])
project = result['ios/vantahome.xcodeproj/project.pbxproj'].decode()
assert config['scheme'] == 'vantahome-preview'
assert config['ios']['bundleIdentifier'] == identity['bundleIdentifier']
assert config['ios']['buildNumber'] == info['CFBundleVersion'] == '42'
assert config['android']['package'] == 'com.anonymous.vantahome'
assert info['CFBundleIdentifier'] == '$(PRODUCT_BUNDLE_IDENTIFIER)'
assert info['CFBundleURLTypes'] == [{'CFBundleURLSchemes':['vantahome-preview',identity['bundleIdentifier']]}]
assert project.count('PRODUCT_BUNDLE_IDENTIFIER = com.anonymous.vantahome.preview;') == 2
assert project.count('CURRENT_PROJECT_VERSION = 42;') == 2
`);
});

test('preview metadata refuses unexpected source identity and extra native targets', () => {
  runPython(String.raw`
original = original_metadata()
original['app.json'] = original['app.json'].replace(b'com.anonymous.vantahome',b'unexpected.bundle')
try: preview.preview_metadata(original, identity, 42)
except ValueError: pass
else: raise AssertionError('Unexpected app identity was accepted')
original = original_metadata()
original['ios/vantahome.xcodeproj/project.pbxproj'] += b'PRODUCT_BUNDLE_IDENTIFIER = com.anonymous.vantahome;'
try: preview.preview_metadata(original, identity, 42)
except ValueError: pass
else: raise AssertionError('Unexpected native target was accepted')
`);
});

for (const failure of ['none', 'preflight', 'xcode', 'keyboard-interrupt', 'sigterm']) {
  test(`preview packaging restores all source metadata after ${failure}`, () => {
    runPython(String.raw`
with tempfile.TemporaryDirectory() as folder:
    root = pathlib.Path(folder)
    originals = original_metadata()
    for name, content in originals.items():
        path = root/name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    envfile = write_environment(root, public_environment())
    calls = []
    previous_signal_handler = signal.getsignal(signal.SIGTERM)
    failure = ${JSON.stringify(failure)}
    def run_checked(command, **kwargs):
        """Inspect actual signing invocation and fail at each reversible boundary."""
        calls.append(command)
        environment = kwargs['env']
        assert environment['EXPO_PUBLIC_SUPABASE_URL'] == preview.STAGING_URL
        assert environment['EXPO_PUBLIC_APP_VARIANT'] == 'preview'
        assert environment['EXPO_NO_DOTENV'] == '1'
        assert environment['SENTRY_DISABLE_AUTO_UPLOAD'] == 'true'
        assert 'EXPO_PUBLIC_UNEXPECTED' not in environment
        assert 'SUPABASE_SERVICE_ROLE_KEY' not in environment
        assert json.loads((root/'app.json').read_bytes())['expo']['ios']['bundleIdentifier'] == identity['bundleIdentifier']
        if failure == 'preflight' and len(calls) == 1: raise subprocess.CalledProcessError(1, command)
        if command[0] == 'xcodebuild':
            assert command[command.index('-configuration')+1] == 'Release'
            assert command[command.index('-destination')+1] == 'generic/platform=iOS'
            entitlement_path = next(value.split('=',1)[1] for value in command if value.startswith('CODE_SIGN_ENTITLEMENTS='))
            assert plistlib.loads(pathlib.Path(entitlement_path).read_bytes()) == {}
            if failure == 'xcode': raise subprocess.CalledProcessError(1, command)
            if failure == 'keyboard-interrupt': raise KeyboardInterrupt()
            if failure == 'sigterm': signal.raise_signal(signal.SIGTERM)
        return subprocess.CompletedProcess(command, 0)
    arguments = ['build-ios-preview.py','--env-file',str(envfile),'--build-number','42','--team-id','AAAAAAAAAA',
      '--derived-data',str(root/'derived'),'--log',str(root/'build.log')]
    with patch.object(preview, 'ROOT', root), patch.object(sys, 'argv', arguments), \
      patch.object(preview.subprocess, 'check_output', return_value=json.dumps(identity)), \
      patch.object(preview.subprocess, 'run', side_effect=run_checked), \
      patch.dict(os.environ, {'EXPO_PUBLIC_UNEXPECTED':'must-not-embed','SUPABASE_SERVICE_ROLE_KEY':'must-not-embed'}):
        try: preview.main()
        except (subprocess.CalledProcessError, KeyboardInterrupt): assert failure != 'none'
        else: assert failure == 'none'
    assert {name:(root/name).read_bytes() for name in originals} == originals
    assert bool(calls)
    assert (root/'.expo').is_dir()
    assert signal.getsignal(signal.SIGTERM) == previous_signal_handler
`);
  });
}
