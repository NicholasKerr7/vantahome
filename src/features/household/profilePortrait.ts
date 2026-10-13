import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { randomUUID } from 'expo-crypto';
import type { ImagePickerAsset } from 'expo-image-picker';

const PREFIX = 'vantahome-portrait:';
const FILE_NAME = /^[a-f0-9-]{36}\.(?:jpg|jpeg|png|webp|heic|heif)$/i;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_WEB_URI_LENGTH = 700_000;

/** Resolve app-owned portraits against the current sandbox, including after an iOS update. */
export function resolveProfilePortraitUri(uri?: string | null): string | undefined {
  if (!uri) return undefined;
  if (!uri.startsWith(PREFIX)) return uri;
  const filename = uri.slice(PREFIX.length);
  return FILE_NAME.test(filename) && FileSystem.documentDirectory
    ? `${FileSystem.documentDirectory}portraits/${filename}` : undefined;
}

/** Resize a browser selection into a small durable JPEG instead of persisting a temporary blob URL. */
async function prepareWebPortrait(asset: ImagePickerAsset): Promise<string> {
  if (!/^(blob:|data:image\/)/i.test(asset.uri)) throw new Error('Choose a photo from this device.');
  const image = new globalThis.Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('This photo could not be opened. Try a JPEG or PNG image.'));
    image.src = asset.uri;
  });
  const edge = Math.min(image.naturalWidth, image.naturalHeight);
  if (!edge) throw new Error('This photo has no usable image data.');
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(512, edge);
  canvas.height = canvas.width;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Photo editing is unavailable in this browser.');
  context.drawImage(image, (image.naturalWidth - edge) / 2, (image.naturalHeight - edge) / 2,
    edge, edge, 0, 0, canvas.width, canvas.height);
  const uri = canvas.toDataURL('image/jpeg', 0.82);
  if (!uri.startsWith('data:image/jpeg;base64,') || uri.length > MAX_WEB_URI_LENGTH) {
    throw new Error('This photo is too large. Please choose a smaller image.');
  }
  return uri;
}

/** Keep native images in app documents and browser images in bounded persisted data, without cloud uploads. */
export async function prepareProfilePortrait(asset: ImagePickerAsset): Promise<string> {
  if (asset.type && asset.type !== 'image') throw new Error('Please choose a still photo.');
  if (asset.fileSize && asset.fileSize > MAX_BYTES) throw new Error('Choose a photo smaller than 5 MB.');
  if (Platform.OS === 'web') return prepareWebPortrait(asset);
  if (!FileSystem.documentDirectory || !/^(file|content):\/\//.test(asset.uri)) {
    throw new Error('This photo cannot be saved on this device. Please choose it again.');
  }
  const info = await FileSystem.getInfoAsync(asset.uri);
  if (!info.exists || info.isDirectory) throw new Error('This photo is no longer available. Please choose it again.');
  if (info.size > MAX_BYTES) throw new Error('Choose a photo smaller than 5 MB.');
  const extension = asset.uri.split(/[?#]/)[0].match(/\.(jpg|jpeg|png|webp|heic|heif)$/i)?.[1]?.toLowerCase() ?? 'jpg';
  const filename = `${randomUUID()}.${extension}`;
  const directory = `${FileSystem.documentDirectory}portraits/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${filename}`;
  try {
    await FileSystem.copyAsync({ from: asset.uri, to: destination });
  } catch (error) {
    // A failed copy may leave partial bytes, but must not erase the source or mask the copy error.
    try { await FileSystem.deleteAsync(destination, { idempotent: true }); } catch { /* Retry selection remains available. */ }
    throw error;
  }
  return `${PREFIX}${filename}`;
}

/** Remove only newly prepared, app-owned files when an interrupted save cannot publish them. */
export async function discardPreparedPortrait(uri: string): Promise<void> {
  if (!uri.startsWith(PREFIX)) return;
  const resolved = resolveProfilePortraitUri(uri);
  if (resolved) await FileSystem.deleteAsync(resolved, { idempotent: true });
}
