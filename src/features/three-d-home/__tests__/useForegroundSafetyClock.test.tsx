import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useForegroundSafetyClock } from '../useForegroundSafetyClock';

let changeAppState: (state: AppStateStatus) => void;
const remove = jest.fn();
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalAppState = Object.getOwnPropertyDescriptor(AppState, 'currentState');

/** Supply only browser visibility events, leaving native clock tests independent of a DOM. */
class TestPage extends EventTarget {
  hidden = false;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: undefined });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    changeAppState = listener;
    return { remove };
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
  if (originalAppState) Object.defineProperty(AppState, 'currentState', originalAppState);
});

test('ticks one foreground second at a time only after the client is enabled and ready', () => {
  const client = { advanceSafety: jest.fn(), pauseSafety: jest.fn() };
  const screen = renderHook<void, { enabled: boolean }>(({ enabled }) => useForegroundSafetyClock(client, enabled), { initialProps: { enabled: false } });
  act(() => jest.advanceTimersByTime(3000));
  expect(client.advanceSafety).not.toHaveBeenCalled();
  expect(AppState.addEventListener).not.toHaveBeenCalled();
  screen.rerender({ enabled: true });
  act(() => jest.advanceTimersByTime(3100));
  expect(client.advanceSafety.mock.calls).toEqual([[1], [1], [1]]);
  screen.rerender({ enabled: false });
  act(() => jest.advanceTimersByTime(5000));
  expect(client.advanceSafety).toHaveBeenCalledTimes(3);
  expect(remove).toHaveBeenCalledTimes(1);
});

test('pauses once across inactive and background, then resumes ticks without wall-clock catch-up', () => {
  const client = { advanceSafety: jest.fn(), pauseSafety: jest.fn() };
  const screen = renderHook(() => useForegroundSafetyClock(client, true));
  act(() => jest.advanceTimersByTime(1000));
  act(() => { changeAppState('inactive'); changeAppState('background'); });
  expect(client.pauseSafety).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(60_000));
  expect(client.advanceSafety).toHaveBeenCalledTimes(1);
  act(() => { jest.setSystemTime(Date.now() + 3_600_000); changeAppState('active'); });
  expect(client.advanceSafety).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(1000));
  expect(client.advanceSafety.mock.calls).toEqual([[1], [1]]);
  screen.unmount();
  act(() => jest.advanceTimersByTime(5000));
  expect(client.advanceSafety).toHaveBeenCalledTimes(2);
  expect(remove).toHaveBeenCalledTimes(1);
});

test('coalesces hidden web pages with native background events and never runs behind either', () => {
  const page = new TestPage();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: page });
  const client = { advanceSafety: jest.fn(), pauseSafety: jest.fn() };
  const screen = renderHook(() => useForegroundSafetyClock(client, true));
  act(() => { page.hidden = true; page.dispatchEvent(new Event('visibilitychange')); changeAppState('background'); });
  expect(client.pauseSafety).toHaveBeenCalledTimes(1);
  act(() => { page.hidden = false; page.dispatchEvent(new Event('visibilitychange')); jest.advanceTimersByTime(3000); });
  expect(client.advanceSafety).not.toHaveBeenCalled();
  act(() => { changeAppState('active'); jest.advanceTimersByTime(1000); });
  expect(client.advanceSafety).toHaveBeenCalledWith(1);
  screen.unmount();
  act(() => { page.hidden = true; page.dispatchEvent(new Event('visibilitychange')); });
  expect(client.pauseSafety).toHaveBeenCalledTimes(1);
});

test('pauses an already hidden ready client and maintains one clock under StrictMode', () => {
  const page = new TestPage();
  page.hidden = true;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: page });
  const client = { advanceSafety: jest.fn(), pauseSafety: jest.fn() };
  renderHook(() => useForegroundSafetyClock(client, true), { wrapper: React.StrictMode });
  expect(client.pauseSafety).toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(5000));
  expect(client.advanceSafety).not.toHaveBeenCalled();
  act(() => { page.hidden = false; page.dispatchEvent(new Event('visibilitychange')); jest.advanceTimersByTime(3000); });
  expect(client.advanceSafety.mock.calls).toEqual([[1], [1], [1]]);
});
