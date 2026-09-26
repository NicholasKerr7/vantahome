import { describe, expect, it } from 'vitest';
import { resolveViewportLayout, resolveViewportResize } from './viewportLayout';

describe('supported device layouts', () => {
  it.each([
    [320, 568], [390, 844], [430, 932], [599, 900],
  ])('uses phone portrait at %sx%s', (width, height) => {
    expect(resolveViewportLayout(width, height)).toBe('mobile-portrait');
  });

  it.each([[600, 960], [768, 1024], [834, 1194], [1024, 1366], [1440, 2560]])('keeps tablet portrait at %sx%s', (width, height) => {
    expect(resolveViewportLayout(width, height)).toBe('tablet-portrait');
  });

  it.each([[960, 600], [1024, 768], [1194, 834], [1366, 1024], [1920, 1080], [3440, 1440]])('uses the tablet landscape preview at %sx%s', (width, height) => {
    expect(resolveViewportLayout(width, height)).toBe('tablet-landscape');
  });

  it.each([[568, 320], [844, 390], [932, 430]])('asks for phone portrait at %sx%s', (width, height) => {
    expect(resolveViewportLayout(width, height)).toBe('mobile-landscape');
  });

  it('keeps phone portrait through keyboard open, blur, closing and height recovery', () => {
    const portrait = { width: 390, height: 844, layout: 'mobile-portrait' as const, keyboardBaselineHeight: null };
    const open = resolveViewportResize(390, 300, portrait, true);
    expect(open.layout).toBe('mobile-portrait');
    const blurred = resolveViewportResize(390, 300, open, false);
    expect(blurred.layout).toBe('mobile-portrait');
    expect(blurred.keyboardBaselineHeight).toBe(844);
    const closing = resolveViewportResize(390, 650, blurred, false);
    expect(closing.layout).toBe('mobile-portrait');
    const recovered = resolveViewportResize(390, 824, closing, false);
    expect(recovered.layout).toBe('mobile-portrait');
    expect(recovered.keyboardBaselineHeight).toBeNull();
  });

  it('keeps a portrait tablet form below the scene when its keyboard opens', () => {
    const portrait = { width: 834, height: 1194, layout: 'tablet-portrait' as const, keyboardBaselineHeight: null };
    expect(resolveViewportResize(834, 480, portrait, true).layout).toBe('tablet-portrait');
  });

  it('recognizes rotation even while a keyboard is closing', () => {
    const keyboard = { width: 390, height: 300, layout: 'mobile-portrait' as const, keyboardBaselineHeight: 844 };
    const landscape = resolveViewportResize(844, 390, keyboard, true);
    expect(landscape.layout).toBe('mobile-landscape');
    expect(landscape.keyboardBaselineHeight).toBeNull();
    expect(resolveViewportResize(390, 844, landscape, false).layout).toBe('mobile-portrait');
  });

  it('does not suppress ordinary window resizes without a keyboard', () => {
    const portrait = { width: 390, height: 844, layout: 'mobile-portrait' as const, keyboardBaselineHeight: null };
    expect(resolveViewportResize(390, 300, portrait, false).layout).toBe('mobile-landscape');
  });

  it.each([[0, 0], [NaN, 844], [390, Infinity]])('handles unavailable viewport dimensions', (width, height) => {
    expect(resolveViewportLayout(width, height)).toBe('mobile-portrait');
  });
});
