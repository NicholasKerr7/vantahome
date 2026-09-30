import { DEVICE_KINDS } from '../../../../packages/home-scene/src/deviceCapabilities';
import { getInspectorPages } from '../../../../packages/home-scene/src/deviceRoutinePages';
import { controlPageAnchor, getNativeControlCapacity, resolveControlPage } from '../nativeControlPagination';

test.each([1.3, 1.6])('paginates every capability once in a short phone body at font scale %s', (fontScale) => {
  const capacity = getNativeControlCapacity({ width: 278, height: 130 }, fontScale, true);
  expect(capacity.fields).toBe(1);
  expect(capacity.actions).toBe(1);
  expect(capacity.options).toBe(1);
  expect(capacity.singleColumn).toBe(true);
  for (const kind of DEVICE_KINDS) {
    const original = getInspectorPages({ kind }, 3);
    const pages = getInspectorPages({ kind }, capacity.fields, capacity.actions);
    expect(pages.flatMap((page) => page.capabilities.map((capability) => capability.id)))
      .toEqual(original.flatMap((page) => page.capabilities.map((capability) => capability.id)));
    expect(pages.every((page) => page.capabilities.length <= 1)).toBe(true);
    expect(pages.filter((page) => page.id === 'shared-routines')).toHaveLength(original.some((page) => page.id === 'shared-routines') ? 1 : 0);
  }
});

test('uses more of a roomy tablet while reserving native slider and touch-target height', () => {
  expect(getNativeControlCapacity({ width: 380, height: 400 }, 1, false))
    .toEqual({ fields: 3, actions: 6, options: 6, singleColumn: false });
  expect(getNativeControlCapacity({ width: 278, height: 0 }, 1.6, true))
    .toEqual({ fields: 1, actions: 1, options: 1, singleColumn: true });
});

test('retains the currently visible capability when one-control pages expand after rotation', () => {
  const smallPages = getInspectorPages({ kind: 'tv' }, 1, 1).filter((page) => page.group === 'controls');
  const largePages = getInspectorPages({ kind: 'tv' }, 3, 6).filter((page) => page.group === 'controls');
  for (const page of smallPages) {
    const anchor = controlPageAnchor(page)!;
    const destination = largePages[resolveControlPage(largePages, anchor)];
    expect(destination.capabilities.some((capability) => capability.id === anchor)).toBe(true);
  }
  expect(resolveControlPage(largePages, 'deleted-capability')).toBe(0);
});
