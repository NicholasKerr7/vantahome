import React, { type RefObject } from 'react';
import { Platform, ScrollView, StyleSheet, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react-native';
import PageScrollRail from '../PageScrollRail';
import { PAGE_RAIL_INTERVAL, usePageScrollRail } from '../usePageScrollRail';

let mockScope = { sessionEpoch: 1, authenticatedUserId: 'owner-a', activeHomeId: 'home-a' };
jest.mock('../../store/useHomeStore', () => ({ useHomeStore: (selector: (state: typeof mockScope) => unknown) => selector(mockScope) }));
jest.mock('../useDecorativeMotion', () => ({ useDecorativeMotion: () => true }));

const originalPlatform = Platform.OS;
const initialPosition = { page: 1, count: 5, width: 210, resetKey: 'rooms', motionAllowed: true };

/** Supply the native offset consumed by the rail without unrelated ScrollView event fields. */
function scrollEvent(page: number): NativeSyntheticEvent<NativeScrollEvent> {
  return { nativeEvent: { contentOffset: { x: page * PAGE_RAIL_INTERVAL, y: 0 } } } as NativeSyntheticEvent<NativeScrollEvent>;
}

/** Expose the imperative scroll target while keeping hook interactions independent of native rendering. */
function mountRail(position = initialPosition) {
  const scrollTo = jest.fn();
  const ref = { current: { scrollTo } } as unknown as RefObject<ScrollView | null>;
  const onChange = jest.fn();
  const hook = renderHook<ReturnType<typeof usePageScrollRail>, { currentPosition: Parameters<typeof usePageScrollRail>[1] }>(
    ({ currentPosition }) => usePageScrollRail(ref, currentPosition, onChange), {
    initialProps: { currentPosition: position },
  });
  return { ...hook, onChange, scrollTo };
}

beforeEach(() => {
  jest.useFakeTimers();
  Platform.OS = 'ios';
  mockScope = { sessionEpoch: 1, authenticatedUserId: 'owner-a', activeHomeId: 'home-a' };
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  Platform.OS = originalPlatform;
});

test('initial positioning and programmatic scroll events never navigate the collection', () => {
  const rail = mountRail();
  expect(rail.scrollTo).toHaveBeenLastCalledWith({ x: PAGE_RAIL_INTERVAL, y: 0, animated: false });
  act(() => { rail.result.current.onScroll(scrollEvent(4)); rail.result.current.onMomentumScrollEnd(scrollEvent(4)); });
  expect(rail.onChange).not.toHaveBeenCalled();
});

test('native momentum cancels the release fallback and commits only its final page once', () => {
  const rail = mountRail();
  act(() => {
    rail.result.current.onScrollBeginDrag();
    rail.result.current.onScrollEndDrag(scrollEvent(1.6));
    rail.result.current.onMomentumScrollBegin();
    jest.advanceTimersByTime(500);
  });
  expect(rail.onChange).not.toHaveBeenCalled();
  act(() => { rail.result.current.onScroll(scrollEvent(2.5)); rail.result.current.onMomentumScrollEnd(scrollEvent(3)); });
  expect(rail.onChange).toHaveBeenCalledTimes(1);
  expect(rail.onChange).toHaveBeenCalledWith(3);
  act(() => rail.result.current.onMomentumScrollEnd(scrollEvent(4)));
  expect(rail.onChange).toHaveBeenCalledTimes(1);
});

test('a drag with no momentum settles to the closest valid page and clamps overshoot', () => {
  const rail = mountRail();
  act(() => { rail.result.current.onScrollBeginDrag(); rail.result.current.onScrollEndDrag(scrollEvent(2.6)); });
  act(() => jest.advanceTimersByTime(160));
  expect(rail.onChange).toHaveBeenLastCalledWith(3);
  act(() => { rail.result.current.onScrollBeginDrag(); rail.result.current.onScrollEndDrag(scrollEvent(20)); });
  act(() => jest.advanceTimersByTime(160));
  expect(rail.onChange).toHaveBeenLastCalledWith(4);
});

test.each([
  ['collection', { resetKey: 'another-room' }],
  ['count', { count: 3 }],
  ['viewport', { width: 320 }],
  ['external page', { page: 0 }],
  ['motion policy', { motionAllowed: false }],
])('a changed %s invalidates a pending gesture before its delayed completion', (_label, update) => {
  const rail = mountRail();
  act(() => { rail.result.current.onScrollBeginDrag(); rail.result.current.onScrollEndDrag(scrollEvent(3)); });
  rail.rerender({ currentPosition: { ...initialPosition, ...update } });
  act(() => { jest.advanceTimersByTime(300); rail.result.current.onMomentumScrollEnd(scrollEvent(3)); });
  expect(rail.onChange).not.toHaveBeenCalled();
});

test('reduced motion keeps arrow synchronization and direct page selection instantaneous', () => {
  const rail = mountRail({ ...initialPosition, motionAllowed: false });
  rail.rerender({ currentPosition: { ...initialPosition, page: 2, motionAllowed: false } });
  expect(rail.scrollTo).toHaveBeenLastCalledWith({ x: 2 * PAGE_RAIL_INTERVAL, y: 0, animated: false });
  act(() => rail.result.current.selectPage(4));
  expect(rail.scrollTo).toHaveBeenLastCalledWith({ x: 4 * PAGE_RAIL_INTERVAL, y: 0, animated: false });
  expect(rail.onChange).toHaveBeenCalledWith(4);
});

test('web horizontal wheel momentum waits for the last scroll sample before changing page', () => {
  Platform.OS = 'web';
  const rail = mountRail();
  act(() => {
    rail.result.current.webInputHandlers.onWheel?.({ deltaX: 152, deltaY: 0, shiftKey: false, ctrlKey: false });
    rail.result.current.onScroll(scrollEvent(2));
    jest.advanceTimersByTime(120);
    rail.result.current.onScroll(scrollEvent(3));
    jest.advanceTimersByTime(120);
  });
  expect(rail.onChange).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(40));
  expect(rail.onChange).toHaveBeenCalledWith(3);
});

test('vertical wheel and browser zoom input cannot select or recenter a rail page', () => {
  Platform.OS = 'web';
  const rail = mountRail();
  rail.scrollTo.mockClear();
  act(() => {
    rail.result.current.webInputHandlers.onWheel?.({ deltaX: 0, deltaY: 152, shiftKey: false, ctrlKey: false });
    rail.result.current.webInputHandlers.onWheel?.({ deltaX: 152, deltaY: 0, shiftKey: false, ctrlKey: true });
    rail.result.current.onScroll(scrollEvent(3));
    jest.advanceTimersByTime(300);
  });
  expect(rail.onChange).not.toHaveBeenCalled();
  expect(rail.scrollTo).not.toHaveBeenCalled();
});

test('unmount clears a pending settle callback', () => {
  const rail = mountRail();
  act(() => { rail.result.current.onScrollBeginDrag(); rail.result.current.onScrollEndDrag(scrollEvent(3)); });
  rail.unmount();
  act(() => jest.advanceTimersByTime(300));
  expect(rail.onChange).not.toHaveBeenCalled();
});

test('page targets expose selected state and retain a 46px bounded footer', () => {
  const change = jest.fn();
  const screen = render(<PageScrollRail page={1} count={4} onChange={change} label="rooms" />);
  expect(screen.getByText('2 / 4')).toBeTruthy();
  const selected = screen.getByRole('button', { name: 'Go to rooms page 2 of 4' });
  expect(selected.props.accessibilityState.selected).toBe(true);
  expect(StyleSheet.flatten(selected.props.style).minHeight).toBe(46);
  expect(StyleSheet.flatten(screen.getByTestId('page-scroll-rail').props.style).height).toBe(46);
  fireEvent.press(screen.getByRole('button', { name: 'Go to rooms page 4 of 4' }));
  expect(change).toHaveBeenCalledWith(3);
});

test('single or invalid counts remain static, and invalid pages cannot escape the range', () => {
  const screen = render(<PageScrollRail page={9} count={1} onChange={jest.fn()} label="rooms" />);
  expect(screen.getByText('1 / 1')).toBeTruthy();
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  screen.rerender(<PageScrollRail page={Number.NaN} count={Number.POSITIVE_INFINITY} onChange={jest.fn()} label="rooms" />);
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  screen.rerender(<PageScrollRail page={99} count={3} onChange={jest.fn()} label="rooms" />);
  expect(screen.getByRole('button', { name: 'Go to rooms page 3 of 3' }).props.accessibilityState.selected).toBe(true);
});

test('a household or session switch cancels the old rail gesture even with identical page counts', () => {
  const change = jest.fn();
  const screen = render(<PageScrollRail page={0} count={4} onChange={change} label="rooms" />);
  fireEvent(screen.getByTestId('page-scroll-rail'), 'layout', { nativeEvent: { layout: { width: 210 } } });
  const scroll = screen.UNSAFE_getByType(ScrollView);
  fireEvent(scroll, 'scrollBeginDrag');
  fireEvent(scroll, 'scrollEndDrag', scrollEvent(2));
  mockScope = { sessionEpoch: 2, authenticatedUserId: 'owner-b', activeHomeId: 'home-b' };
  screen.rerender(<PageScrollRail page={0} count={4} onChange={change} label="rooms" />);
  act(() => jest.advanceTimersByTime(300));
  expect(change).not.toHaveBeenCalled();
});
