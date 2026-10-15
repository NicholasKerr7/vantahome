import { describe, expect, it } from 'vitest';
import { createDefaultDevicePlacement } from '../devicePlacement';
import { nativePlacementScript, parsePlacementMessage, PLACEMENT_CHANNEL, type PlacementMessage } from './placementProtocol';

const placement = createDefaultDevicePlacement('master-bedside-left', 'living')!;
const message = { channel: PLACEMENT_CHANNEL, version: 1, type: 'configure', placement, disabled: false, devices: [] } satisfies PlacementMessage;

describe('placement sandbox boundary', () => {
  it('round trips a bounded geometry-only configuration and rejects command-shaped additions', () => {
    expect(parsePlacementMessage(JSON.stringify(message))).toEqual(message);
    expect(parsePlacementMessage({ ...message, command: 'open-gate' })).toBeNull();
    expect(parsePlacementMessage({ ...message, devices: [{ entityId: 'real-device' }] })).toBeNull();
    expect(parsePlacementMessage({ ...message, placement: { ...placement, position: [NaN, 1, 3] } })).toBeNull();
    expect(parsePlacementMessage({ ...message, placement: { ...placement, modelRoomId: 'unknown' } })).toBeNull();
    expect(parsePlacementMessage(' '.repeat(25000))).toBeNull();
  });
  it('accepts only explicit status and change events, without an arbitrary navigation target', () => {
    expect(parsePlacementMessage({ channel: PLACEMENT_CHANNEL, version: 1, type: 'ready' })?.type).toBe('ready');
    expect(parsePlacementMessage({ channel: PLACEMENT_CHANNEL, version: 1, type: 'rendered' })?.type).toBe('rendered');
    expect(parsePlacementMessage({ channel: PLACEMENT_CHANNEL, version: 1, type: 'change', placement })?.type).toBe('change');
    expect(parsePlacementMessage({ channel: PLACEMENT_CHANNEL, version: 1, type: 'ready', url: 'https://example.com' })).toBeNull();
    expect(parsePlacementMessage({ channel: PLACEMENT_CHANNEL, version: 1, type: 'rendered', deviceState: {} })).toBeNull();
  });
  it('encodes names as data rather than executable document markup', () => {
    const script = nativePlacementScript({ ...message, devices: [{ id: 'placed-00000000-0000-4000-8000-000000000000', name: '</script><script>alert(1)</script>', placement }] });
    expect(script).not.toContain('</script>');
    expect(script).toContain('\\u003c/script>');
  });
});
