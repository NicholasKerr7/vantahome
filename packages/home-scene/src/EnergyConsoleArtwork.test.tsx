// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { EnergyConsoleArtwork } from './EnergyConsoleArtwork';
import { readEnergyControllerState, type EnergyDeviceKind } from './energyController';

let container: HTMLDivElement;
let root: Root;

/** Use the same selected-device projection as the controller, without mounting the store. */
function fixture(kind: EnergyDeviceKind) {
  const state = readEnergyControllerState(getDevice(`utility-${kind}`)!, { on: true, level: 55 });
  if (!state) throw new Error(`Missing energy fixture: ${kind}`);
  return state;
}

/** Read the sampled gauge separately from decorative power indicators. */
function chargeGauge(): SVGRectElement {
  const gauge = container.querySelector<SVGRectElement>('[data-testid="energy-battery-charge-fill"]');
  if (!gauge) throw new Error('Missing sampled battery gauge');
  return gauge;
}

/** Compare state-driven material changes without coupling tests to equipment path coordinates. */
function paintSignature(): string {
  return JSON.stringify([...container.querySelectorAll('path, rect, circle, ellipse')].map((shape) =>
    ['fill', 'stroke', 'opacity'].map((attribute) => shape.getAttribute(attribute))));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('shared energy equipment artwork', () => {
  it.each(['solar', 'battery', 'generator', 'energy'] as const)('isolates paint servers between mounted %s previews and remains decorative', (kind) => {
    const energy = fixture(kind);
    act(() => root.render(<><EnergyConsoleArtwork energy={energy} /><EnergyConsoleArtwork energy={energy} /></>));
    const previews = [...container.querySelectorAll('svg.energy-artwork')];
    expect(previews).toHaveLength(2);
    const allIds = [...container.querySelectorAll('[id]')].map((node) => node.id);
    expect(allIds.length).toBeGreaterThan(0);
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const preview of previews) {
      const localIds = new Set([...preview.querySelectorAll('[id]')].map((node) => node.id));
      const references = [...preview.querySelectorAll('[fill], [stroke]')].flatMap((node) =>
        ['fill', 'stroke'].map((name) => node.getAttribute(name)).filter((value) => value?.startsWith('url(')));
      expect(references.length).toBeGreaterThan(0);
      for (const reference of references) {
        const match = /^url\(#(.+)\)$/.exec(reference!);
        expect(match, `Local paint reference: ${reference}`).not.toBeNull();
        expect(localIds.has(match![1]), `Paint server belongs to its own preview: ${reference}`).toBe(true);
      }
      expect(new Set(references)).toEqual(new Set([...localIds].map((id) => `url(#${id})`)));
      const viewBox = preview.getAttribute('viewBox')!.split(/\s+/).map(Number);
      expect(viewBox).toHaveLength(4);
      expect(viewBox.every(Number.isFinite)).toBe(true);
      expect(viewBox[2]).toBeGreaterThan(0);
      expect(viewBox[3]).toBeGreaterThan(0);
      expect(preview.innerHTML).not.toMatch(/NaN|Infinity/);
      expect(preview.getAttribute('aria-hidden')).toBe('true');
      expect(preview.matches('[tabindex], [focusable="true"]')).toBe(false);
      expect(preview.querySelector('a, button, input, [tabindex], [focusable="true"]')).toBeNull();
      expect(preview.querySelector('image, foreignObject, filter, animate, animateTransform')).toBeNull();
    }
  });

  it('retains native-compatible gradient coordinates and only referenced materials through device state changes', () => {
    for (const kind of ['solar', 'battery', 'generator', 'energy'] as const) {
      const energy = fixture(kind);
      for (const on of [true, false]) {
        act(() => root.render(<EnergyConsoleArtwork energy={{ ...energy, on }} />));
        for (const gradient of container.querySelectorAll('linearGradient, radialGradient')) {
          expect(container.querySelector(`[fill="url(#${gradient.id})"], [stroke="url(#${gradient.id})"]`)).not.toBeNull();
          // Percent geometry has identical object-bounding-box meaning in browser and native SVG.
          const coordinates = gradient.tagName === 'radialGradient' ? ['cx', 'cy', 'r'] : ['x1', 'y1', 'x2', 'y2'];
          for (const coordinate of coordinates) {
            const value = gradient.getAttribute(coordinate)!;
            expect(value).toMatch(/^\d+(?:\.\d+)?%$/);
            expect(Number.parseFloat(value)).toBeLessThanOrEqual(100);
          }
          const offsets = [...gradient.querySelectorAll('stop')].map((stop) => Number(stop.getAttribute('offset')));
          expect(offsets.every((offset) => Number.isFinite(offset) && offset >= 0 && offset <= 1)).toBe(true);
          expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
        }
      }
    }
  });

  it('does not manufacture sunlight changes when checking a solar sample or changing its readings', () => {
    const solar = fixture('solar');
    if (solar.kind !== 'solar') throw new Error('Expected solar projection');
    act(() => root.render(<EnergyConsoleArtwork energy={solar} />));
    const original = container.innerHTML;
    act(() => root.render(<EnergyConsoleArtwork energy={{ ...solar, on: false, sampleChecked: true,
      inverterStatus: 'Standby', headline: { ...solar.headline, value: 0 } }} />));
    expect(container.innerHTML).toBe(original);
  });

  it('retains the sampled battery gauge when disabled or when reserve and storage preferences change', () => {
    const battery = fixture('battery');
    if (battery.kind !== 'battery') throw new Error('Expected battery projection');
    act(() => root.render(<EnergyConsoleArtwork energy={{ ...battery, chargePercent: 47 }} />));
    const original = chargeGauge().outerHTML;
    expect(Number(chargeGauge().getAttribute('height'))).toBeGreaterThan(0);
    act(() => root.render(<EnergyConsoleArtwork energy={{ ...battery, chargePercent: 47, on: false,
      reservePercent: 60, storageMode: 'charge' }} />));
    expect(chargeGauge().outerHTML).toBe(original);
  });

  it('keeps zero, unavailable and malformed battery samples bounded without invalid SVG values', () => {
    const battery = fixture('battery');
    if (battery.kind !== 'battery') throw new Error('Expected battery projection');
    for (const chargePercent of [0, null, Number.NaN, Number.POSITIVE_INFINITY, -20, 120]) {
      act(() => root.render(<EnergyConsoleArtwork energy={{ ...battery, chargePercent }} />));
      const height = Number(chargeGauge().getAttribute('height'));
      const top = Number(chargeGauge().getAttribute('y'));
      expect(Number.isFinite(height)).toBe(true);
      expect(height).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top + height).toBeLessThanOrEqual(160);
      expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
      if (chargePercent === null) expect(chargeGauge().getAttribute('opacity')).toBe('0');
      if (chargePercent === 0) {
        expect(height).toBe(0);
        expect(Number(chargeGauge().getAttribute('opacity'))).toBeGreaterThan(0);
      }
    }
  });

  it('changes generator indicators only with confirmed simulated power, not start preferences or sample output', () => {
    const generator = fixture('generator');
    if (generator.kind !== 'generator') throw new Error('Expected generator projection');
    act(() => root.render(<EnergyConsoleArtwork energy={{ ...generator, on: false, mode: 'manual', outputW: 0 }} />));
    const stopped = paintSignature();
    act(() => root.render(<EnergyConsoleArtwork energy={{ ...generator, on: false, mode: 'auto', outputW: 3900 }} />));
    expect(paintSignature()).toBe(stopped);
    act(() => root.render(<EnergyConsoleArtwork energy={{ ...generator, on: true, mode: 'auto', outputW: 0 }} />));
    expect(paintSignature()).not.toBe(stopped);
    act(() => root.render(<EnergyConsoleArtwork energy={{ ...generator, on: false, mode: 'auto', outputW: 0 }} />));
    expect(paintSignature()).toBe(stopped);
  });

  it('distinguishes available, unavailable and unknown grid samples without inferring status from demand', () => {
    const energy = fixture('energy');
    if (energy.kind !== 'energy') throw new Error('Expected home energy projection');
    const signatures = new Set<string>();
    for (const gridAvailable of [true, false, null]) {
      act(() => root.render(<EnergyConsoleArtwork energy={{ ...energy, gridAvailable }} />));
      const expected = paintSignature();
      signatures.add(expected);
      act(() => root.render(<EnergyConsoleArtwork energy={{ ...energy, gridAvailable, on: false,
        budgetKwh: 0, headline: { ...energy.headline, value: 0 } }} />));
      expect(paintSignature()).toBe(expected);
    }
    expect(signatures.size).toBe(3);
  });
});
