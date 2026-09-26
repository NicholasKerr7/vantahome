import { afterEach, describe, expect, it, vi } from 'vitest';
import { getModelUrl, isEmbeddedScene, reportSceneStatus } from './embeddedHost';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('embedded simulation boundary', () => {
  it('uses packaged model data only when available', () => {
    expect(getModelUrl('ground')).toContain('models/ground.glb');
    vi.stubGlobal('__VANTAHOME_MODEL_URLS', { ground: 'data:model/gltf-binary;base64,abc' });
    expect(getModelUrl('ground')).toBe('data:model/gltf-binary;base64,abc');
  });
  it('reports readiness to native without account or command fields', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('__VANTAHOME_EMBEDDED__', true);
    vi.stubGlobal('ReactNativeWebView', { postMessage });
    reportSceneStatus('ready');
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ channel: 'vantahome-scene', version: 1, status: 'ready' }));
  });
  it('reports only to the parent frame and leaves standalone scenes alone', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { parent: { postMessage } });
    reportSceneStatus('ready');
    expect(postMessage).not.toHaveBeenCalled();
    vi.stubGlobal('__VANTAHOME_EMBEDDED__', true);
    reportSceneStatus('error');
    expect(postMessage).toHaveBeenCalledWith({ channel: 'vantahome-scene', version: 1, status: 'error' }, '*');
    expect(isEmbeddedScene()).toBe(true);
  });
  it('neither reads nor writes browser storage for embedded simulation controls', async () => {
    const getItem = vi.fn(); const setItem = vi.fn();
    vi.stubGlobal('__VANTAHOME_EMBEDDED__', true);
    vi.stubGlobal('window', { localStorage: { getItem, setItem } });
    const { useHomeStore } = await import('./state');
    useHomeStore.getState().toggleDevice('living-light');
    useHomeStore.getState().setNight(true);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(useHomeStore.getState().persistenceError).toBe(false);
  });
});
