import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { prepareNativeScene } from '../prepareNativeScene';

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
