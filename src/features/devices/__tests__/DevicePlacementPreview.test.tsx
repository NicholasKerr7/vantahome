import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { createDefaultDevicePlacement } from '../../../../packages/home-scene/src/devicePlacement';
import { PLACEMENT_CHANNEL } from '../../../../packages/home-scene/src/placement/placementProtocol';
import DevicePlacementPreview from '../DevicePlacementPreview';
import { PLACEMENT_PREVIEW_TIMEOUT_MS } from '../usePlacementPreviewReadiness';

type NativeMessage = { nativeEvent: { data: string; url?: string } };
let mockMessage: (event: NativeMessage) => void;
const mockInject = jest.fn();
jest.mock('../../three-d-home/prepareNativeScene', () => ({ prepareNativeScene: async () => 'file:///cache/index.html' }));
jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { WebView: React.forwardRef(({ onMessage }: { onMessage: (event: NativeMessage) => void }, ref) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }));
    mockMessage = onMessage;
    return <View testID="placement-document" />;
  }) };
});
const placement = createDefaultDevicePlacement('master-light', 'living')!;
/** Deliver a simulated bridge event without bypassing the production document identity check. */
function send(type: 'ready' | 'rendered', url = 'file:///cache/index.html#placement'): void {
  mockMessage({ nativeEvent: { url, data: JSON.stringify({ channel: PLACEMENT_CHANNEL, version: 1, type }) } });
}
beforeEach(() => { jest.useFakeTimers(); mockInject.mockClear(); });
afterEach(() => jest.useRealTimers());

test('keeps the loading cover after bridge readiness and waits for an actual frame from the local document', async () => {
  const screen = render(<DevicePlacementPreview placement={placement} onChange={jest.fn()} />);
  await act(async () => { await Promise.resolve(); });
  act(() => send('ready'));
  expect(mockInject).toHaveBeenCalledWith(expect.stringContaining('"type":"configure"'));
  expect(screen.getByText('Preparing your room…')).toBeTruthy();
  act(() => send('rendered', 'https://untrusted.example/'));
  expect(screen.getByText('Preparing your room…')).toBeTruthy();
  act(() => send('rendered'));
  expect(screen.queryByText('Preparing your room…')).toBeNull();
  screen.unmount();
});

test('offers retry when the renderer stalls after its bridge is ready', async () => {
  const screen = render(<DevicePlacementPreview placement={placement} onChange={jest.fn()} />);
  await act(async () => { await Promise.resolve(); });
  act(() => send('ready'));
  act(() => jest.advanceTimersByTime(PLACEMENT_PREVIEW_TIMEOUT_MS));
  expect(screen.getByLabelText('Retry placement preview')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Retry placement preview'));
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText('Preparing your room…')).toBeTruthy();
  act(() => send('ready'));
  act(() => send('rendered'));
  expect(screen.queryByLabelText('Retry placement preview')).toBeNull();
  screen.unmount();
});
