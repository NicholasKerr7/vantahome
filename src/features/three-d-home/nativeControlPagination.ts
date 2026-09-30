import type { DeviceControlPage } from '../../../packages/home-scene/src/deviceCapabilities';

export interface NativeControlSpace { width: number; height: number }
export interface NativeControlCapacity {
  fields: 1 | 2 | 3;
  actions: 1 | 2 | 3 | 4 | 6;
  options: number;
  singleColumn: boolean;
}

/** Reserve native slider and wrapped-label space before choosing a fixed page capacity. */
export function getNativeControlCapacity(space: NativeControlSpace, fontScale: number, compact: boolean): NativeControlCapacity {
  const scale = Math.max(1, fontScale);
  const singleColumn = scale > 1.3 || space.width < 280;
  const gap = 8;
  const fieldHeight = 44 + (compact ? 16 : 24) + 36 * scale;
  const actionHeight = Math.max(54, 36 * scale + 16);
  const optionHeight = Math.max(56, 36 * scale + 24);
  const fields = Math.max(1, Math.min(3, Math.floor((space.height + gap) / (fieldHeight + gap)))) as NativeControlCapacity['fields'];
  const rows = Math.max(1, Math.min(3, Math.floor((space.height + gap) / (actionHeight + gap))));
  return {
    fields,
    actions: (rows * (singleColumn ? 1 : 2)) as NativeControlCapacity['actions'],
    options: Math.max(1, Math.min(6, Math.floor((space.height + gap) / (optionHeight + gap)))),
    singleColumn,
  };
}

/** Keep the first visible capability in view when rotation or larger text changes page size. */
export function controlPageAnchor(page: DeviceControlPage | undefined): string | null {
  return page?.capabilities[0]?.id ?? page?.id ?? null;
}

/** Resolve an anchor against new pages without dropping a control or retaining an invalid index. */
export function resolveControlPage(pages: readonly DeviceControlPage[], anchor: string | null): number {
  const index = pages.findIndex((page) => page.id === anchor || page.capabilities.some((capability) => capability.id === anchor));
  return Math.max(0, index);
}
