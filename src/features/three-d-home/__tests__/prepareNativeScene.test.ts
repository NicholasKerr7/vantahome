import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { prepareNativeScene, prewarmNativeScene } from '../prepareNativeScene';

const mockDownload = jest.fn();
jest.mock('expo-asset', () => ({ Asset: { fromModule: jest.fn(() => ({ downloadAsync: mockDownload })) } }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', getInfoAsync: jest.fn(), makeDirectoryAsync: jest.fn(), copyAsync: jest.fn() }));
jest.mock('../generated/sceneAsset', () => ({ HOME_SCENE_ASSET: 1, HOME_SCENE_BUNDLE_BYTES: 100, HOME_SCENE_BUNDLE_SHA256: 'hash' }));

beforeEach(() => { jest.clearAllMocks(); mockDownload.mockResolvedValue({ localUri: 'file:///bundle/scene.vhscene' }); });
test('reuses a complete versioned cache without reading HTML into JavaScript', async () => {
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, isDirectory: false, size: 100 } as FileSystem.FileInfo);
  expect(await prepareNativeScene()).toBe('file:///cache/home-scene/hash/index.html');
  expect(Asset.fromModule).not.toHaveBeenCalled();
});
test('repairs a truncated cache from the bundled asset and validates the copy', async () => {
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValueOnce({ exists: true, isDirectory: false, size: 10 } as FileSystem.FileInfo).mockResolvedValueOnce({ exists: true, isDirectory: false, size: 100 } as FileSystem.FileInfo);
  await expect(prepareNativeScene()).resolves.toContain('/hash/index.html');
  expect(FileSystem.copyAsync).toHaveBeenCalledWith({ from: 'file:///bundle/scene.vhscene', to: 'file:///cache/home-scene/hash/index.html' });
});
test('reports missing asset and incomplete copies instead of loading a broken document', async () => {
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: false, isDirectory: false, uri: '' });
  mockDownload.mockResolvedValueOnce({ localUri: null });
  await expect(prepareNativeScene()).rejects.toThrow('could not be loaded');
  await expect(prepareNativeScene()).rejects.toThrow('incomplete');
});


/** Pause asset resolution so simultaneous boot and renderer requests can share the same copy. */
function deferredAsset(): { promise: Promise<{ localUri: string }>; resolve: (asset: { localUri: string }) => void } {
  let resolve!: (asset: { localUri: string }) => void;
  const promise = new Promise<{ localUri: string }>((complete) => { resolve = complete; });
  return { promise, resolve };
}

test('prewarming and scene mounting share one in-flight packaged document copy', async () => {
  const asset = deferredAsset();
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValueOnce({ exists: false, isDirectory: false, uri: '' })
    .mockResolvedValueOnce({ exists: true, isDirectory: false, size: 100 } as FileSystem.FileInfo);
  mockDownload.mockReturnValueOnce(asset.promise);
  prewarmNativeScene();
  const first = prepareNativeScene();
  const second = prepareNativeScene();
  expect(first).toBe(second);
  asset.resolve({ localUri: 'file:///bundle/scene.vhscene' });
  await expect(first).resolves.toBe('file:///cache/home-scene/hash/index.html');
  expect(Asset.fromModule).toHaveBeenCalledTimes(1);
  expect(FileSystem.copyAsync).toHaveBeenCalledTimes(1);
});

test('a failed prewarm does not poison the visible retry or hide its error', async () => {
  jest.mocked(FileSystem.getInfoAsync).mockRejectedValueOnce(new Error('Temporary cache failure'));
  prewarmNativeScene();
  await expect(prepareNativeScene()).rejects.toThrow('Temporary cache failure');
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, isDirectory: false, size: 100 } as FileSystem.FileInfo);
  await expect(prepareNativeScene()).resolves.toContain('/hash/index.html');
});

test('a later visit revalidates the file so an OS-evicted cache can be rebuilt', async () => {
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValueOnce({ exists: true, isDirectory: false, size: 100 } as FileSystem.FileInfo)
    .mockResolvedValueOnce({ exists: false, isDirectory: false, uri: '' })
    .mockResolvedValueOnce({ exists: true, isDirectory: false, size: 100 } as FileSystem.FileInfo);
  await prepareNativeScene();
  await prepareNativeScene();
  expect(FileSystem.getInfoAsync).toHaveBeenCalledTimes(3);
  expect(FileSystem.copyAsync).toHaveBeenCalledTimes(1);
});
