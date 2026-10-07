import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { HOME_SCENE_ASSET, HOME_SCENE_BUNDLE_BYTES, HOME_SCENE_BUNDLE_SHA256 } from './generated/sceneAsset';

let preparation: Promise<string> | null = null;

/** Share only an in-flight immutable asset copy; later calls still detect an evicted cache. */
export function prepareNativeScene(): Promise<string> {
  if (preparation) return preparation;
  const pending = materializeNativeScene();
  preparation = pending;
  void pending.then(
    () => { if (preparation === pending) preparation = null; },
    () => { if (preparation === pending) preparation = null; },
  );
  return pending;
}

/** Start packaged-asset preparation early without granting access or blocking account recovery. */
export function prewarmNativeScene(): void {
  // The visible scene retries and presents its own recovery UI if storage is unavailable.
  void prepareNativeScene().catch(() => undefined);
}

/** Materialize the bundled HTML as a local document without transferring it through React props. */
async function materializeNativeScene(): Promise<string> {
  if (!FileSystem.cacheDirectory) throw new Error('Scene cache is unavailable.');
  const directory = `${FileSystem.cacheDirectory}home-scene/${HOME_SCENE_BUNDLE_SHA256}/`;
  const uri = `${directory}index.html`;
  const cached = await FileSystem.getInfoAsync(uri);
  if (cached.exists && !cached.isDirectory && cached.size === HOME_SCENE_BUNDLE_BYTES) return uri;
  const asset = await Asset.fromModule(HOME_SCENE_ASSET).downloadAsync();
  if (!asset.localUri) throw new Error('The bundled scene could not be loaded.');
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  await FileSystem.copyAsync({ from: asset.localUri, to: uri });
  const copied = await FileSystem.getInfoAsync(uri);
  if (!copied.exists || copied.isDirectory || copied.size !== HOME_SCENE_BUNDLE_BYTES) {
    throw new Error('The bundled scene is incomplete.');
  }
  return uri;
}
