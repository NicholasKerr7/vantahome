import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { discardPreparedPortrait, prepareProfilePortrait, resolveProfilePortraitUri } from './profilePortrait';

jest.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///current-app/documents/',
  getInfoAsync: jest.fn(), makeDirectoryAsync: jest.fn(), copyAsync: jest.fn(), deleteAsync: jest.fn(),
}));

const asset = { uri: 'file:///picker/photo.jpg', type: 'image' as const, width: 512, height: 512 };
const token = 'vantahome-portrait:11111111-1111-4111-8111-111111111111.jpg';

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, isDirectory: false, size: 1200,
    uri: asset.uri, modificationTime: 1 });
  jest.mocked(FileSystem.copyAsync).mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

test('copies a picker file into durable documents and resolves relative to the current app container', async () => {
  await expect(prepareProfilePortrait(asset)).resolves.toBe(token);
  expect(FileSystem.copyAsync).toHaveBeenCalledWith({ from: asset.uri,
    to: 'file:///current-app/documents/portraits/11111111-1111-4111-8111-111111111111.jpg' });
  expect(resolveProfilePortraitUri(token)).toBe('file:///current-app/documents/portraits/11111111-1111-4111-8111-111111111111.jpg');
});

test('rejects vanished or oversized files before creating a portrait', async () => {
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValueOnce({ exists: false, isDirectory: false, uri: asset.uri });
  await expect(prepareProfilePortrait(asset)).rejects.toThrow('no longer available');
  await expect(prepareProfilePortrait({ ...asset, fileSize: 6 * 1024 * 1024 })).rejects.toThrow('smaller than');
  expect(FileSystem.copyAsync).not.toHaveBeenCalled();
});

test('never publishes a URI after a failed copy', async () => {
  jest.mocked(FileSystem.copyAsync).mockRejectedValueOnce(new Error('Storage full'));
  await expect(prepareProfilePortrait(asset)).rejects.toThrow('Storage full');
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(resolveProfilePortraitUri(token), { idempotent: true });
});

test('cleanup cannot delete arbitrary files or path traversal', async () => {
  expect(resolveProfilePortraitUri('vantahome-portrait:../../private.json')).toBeUndefined();
  await discardPreparedPortrait('file:///other/profile.jpg');
  await discardPreparedPortrait('vantahome-portrait:../../private.json');
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  await discardPreparedPortrait(token);
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(resolveProfilePortraitUri(token), { idempotent: true });
});

test('retains legacy images for display without downloading remote images during selection', async () => {
  expect(resolveProfilePortraitUri('https://example.test/photo.jpg')).toBe('https://example.test/photo.jpg');
  await expect(prepareProfilePortrait({ ...asset, uri: 'https://example.test/photo.jpg' })).rejects.toThrow('cannot be saved');
});

test('browser selection is cropped and resized before persisting a bounded JPEG', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  const drawImage = jest.fn();
  const dataUri = 'data:image/jpeg;base64,cG9ydHJhaXQ=';
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toDataURL: jest.fn(() => dataUri) };
  const originalImage = globalThis.Image;
  const originalDocument = globalThis.document;
  class BrowserImage {
    naturalWidth = 1600;
    naturalHeight = 1200;
    onload?: () => void;
    set src(_value: string) { this.onload?.(); }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, writable: true, value: BrowserImage });
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: { createElement: () => canvas } });
  try {
    await expect(prepareProfilePortrait({ ...asset, uri: 'blob:chosen-portrait' })).resolves.toBe(dataUri);
    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(512);
    expect(drawImage).toHaveBeenCalledWith(expect.any(BrowserImage), 200, 0, 1200, 1200, 0, 0, 512, 512);
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(globalThis, 'Image', { configurable: true, writable: true, value: originalImage });
    Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: originalDocument });
  }
});


test('a failed partial-file cleanup preserves the original copy error', async () => {
  jest.mocked(FileSystem.copyAsync).mockRejectedValueOnce(new Error('Storage full'));
  jest.mocked(FileSystem.deleteAsync).mockRejectedValueOnce(new Error('Cleanup unavailable'));
  await expect(prepareProfilePortrait(asset)).rejects.toThrow('Storage full');
});
