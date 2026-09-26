import { describe, expect, it, vi } from 'vitest';
import { DirectionalLight, WebGLRenderTarget } from 'three';
import { resizeShadowMap } from './shadowQuality';

describe('shadow resolution changes', () => {
  it('disposes the previous allocation before both lowering and restoring resolution', () => {
    const shadow = new DirectionalLight().shadow;
    for (const [previousSize, nextSize] of [[2048, 1024], [1024, 2048]]) {
      shadow.mapSize.set(previousSize!, previousSize!);
      shadow.map = new WebGLRenderTarget(previousSize, previousSize);
      const disposed = vi.fn();
      shadow.map.addEventListener('dispose', disposed);
      resizeShadowMap(shadow, nextSize!);
      expect(disposed).toHaveBeenCalledOnce();
      expect(shadow.map).toBeNull();
      expect(shadow.mapSize.toArray()).toEqual([nextSize, nextSize]);
      expect(shadow.needsUpdate).toBe(true);
    }
  });

  it('retains the texture when balanced and economy request the same resolution', () => {
    const shadow = new DirectionalLight().shadow;
    shadow.mapSize.set(1024, 1024);
    const allocation = new WebGLRenderTarget(1024, 1024);
    shadow.map = allocation;
    shadow.needsUpdate = false;
    const disposed = vi.fn();
    allocation.addEventListener('dispose', disposed);
    resizeShadowMap(shadow, 1024);
    expect(shadow.map).toBe(allocation);
    expect(shadow.needsUpdate).toBe(false);
    expect(disposed).not.toHaveBeenCalled();
    allocation.dispose();
  });
});
