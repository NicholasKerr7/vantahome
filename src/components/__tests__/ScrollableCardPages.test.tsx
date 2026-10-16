import React, { useState, type RefObject } from 'react';
import { FlatList, Platform, Text, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react-native';
import ScrollableCardPages from '../ScrollableCardPages';
import Pressable from '../Pressable';
import { useCardPageScroll } from '../useCardPageScroll';

jest.mock('../useDecorativeMotion', () => ({ useDecorativeMotion: () => true }));
jest.mock('../../store/useHomeStore', () => ({ useHomeStore: (selector: (state: object) => unknown) => selector({ sessionEpoch: 1, activeHomeId: 'home-a', authenticatedUserId: 'owner-a' }) }));
const initial = { page: 0, count: 4, width: 300, height: 240, scope: 'home:rooms', motionAllowed: true };
const originalPlatform = Platform.OS;

/** Use the actual viewport offset rather than a footer gesture or a replacement-card animation. */
function offset(x: number): NativeSyntheticEvent<NativeScrollEvent> {
  return { nativeEvent: { contentOffset: { x, y: 0 } } } as NativeSyntheticEvent<NativeScrollEvent>;
}

/** Observe list movement independently from platform rendering and asynchronous native animation. */
function mountController(position = initial) {
  const scrollToOffset = jest.fn();
  const list = { current: { scrollToOffset } } as unknown as RefObject<FlatList<number> | null>;
  const onChange = jest.fn();
  const result = renderHook<ReturnType<typeof useCardPageScroll>, Parameters<typeof useCardPageScroll>[1]>(
    (currentPosition) => useCardPageScroll(list, currentPosition, onChange), { initialProps: position });
  return { ...result, scrollToOffset, onChange };
}

beforeEach(() => { jest.useFakeTimers(); Platform.OS = 'ios'; });
afterEach(() => { cleanup(); jest.clearAllTimers(); jest.useRealTimers(); Platform.OS = originalPlatform; });

test('arrow selection smoothly moves the actual list and programmatic offsets never echo navigation', () => {
  const controller = mountController();
  controller.rerender({ ...initial, page: 2 });
  expect(controller.scrollToOffset).toHaveBeenLastCalledWith({ offset: 600, animated: true });
  act(() => controller.result.current.onMomentumScrollEnd(offset(600)));
  expect(controller.onChange).not.toHaveBeenCalled();
});

test('native drag keeps selection stable while cards move, then commits the settled page without activating a card', () => {
  const controller = mountController();
  act(() => {
    controller.result.current.onScrollBeginDrag();
    controller.result.current.onScroll(offset(180));
    controller.result.current.onScrollEndDrag(offset(180));
    controller.result.current.onMomentumScrollBegin();
    jest.advanceTimersByTime(500);
  });
  expect(controller.onChange).not.toHaveBeenCalled();
  expect(controller.result.current.canActivateCard()).toBe(false);
  act(() => controller.result.current.onMomentumScrollEnd(offset(300)));
  expect(controller.onChange).toHaveBeenCalledWith(1);
  expect(controller.result.current.canActivateCard()).toBe(false);
  act(() => jest.advanceTimersByTime(181));
  expect(controller.result.current.canActivateCard()).toBe(true);
});

test.each([
  ['scope', { scope: 'another-home:rooms' }], ['collection count', { count: 2 }],
  ['width', { width: 600 }], ['height', { height: 400 }], ['selected page', { page: 1 }],
])('a changed %s cancels old scroll completion', (_name, changes) => {
  const controller = mountController();
  act(() => { controller.result.current.onScrollBeginDrag(); controller.result.current.onScrollEndDrag(offset(900)); });
  controller.rerender({ ...initial, ...changes });
  act(() => { jest.advanceTimersByTime(300); controller.result.current.onMomentumScrollEnd(offset(900)); });
  expect(controller.onChange).not.toHaveBeenCalled();
});

test('reduced motion updates list position instantly while retaining direct scrolling', () => {
  const controller = mountController({ ...initial, motionAllowed: false });
  controller.rerender({ ...initial, page: 1, motionAllowed: false });
  expect(controller.scrollToOffset).toHaveBeenLastCalledWith({ offset: 300, animated: false });
});

test('web card taps work, but a drag beginning on the same card suppresses release activation', () => {
  Platform.OS = 'web';
  const controller = mountController();
  act(() => controller.result.current.webHandlers.onTouchStart?.({ nativeEvent: { touches: [{ pageX: 250, pageY: 40 }] } }));
  expect(controller.result.current.canActivateCard()).toBe(true);
  act(() => {
    controller.result.current.webHandlers.onTouchMove?.({ nativeEvent: { touches: [{ pageX: 190, pageY: 40 }] } });
    controller.result.current.onScroll(offset(310));
  });
  expect(controller.result.current.canActivateCard()).toBe(false);
  act(() => { controller.result.current.webHandlers.onTouchEnd?.(); jest.advanceTimersByTime(160); });
  expect(controller.onChange).toHaveBeenCalledWith(1);
  expect(controller.result.current.canActivateCard()).toBe(false);
});

test('horizontal web wheel settles cards while vertical wheel and zoom never select a page', () => {
  Platform.OS = 'web';
  const controller = mountController();
  act(() => {
    controller.result.current.webHandlers.onWheel?.({ deltaX: 0, deltaY: 300, shiftKey: false, ctrlKey: false });
    controller.result.current.onScroll(offset(300));
    jest.advanceTimersByTime(200);
  });
  expect(controller.onChange).not.toHaveBeenCalled();
  act(() => {
    controller.result.current.webHandlers.onWheel?.({ deltaX: 300, deltaY: 0, shiftKey: false, ctrlKey: false });
    controller.result.current.onScroll(offset(600));
    jest.advanceTimersByTime(160);
  });
  expect(controller.onChange).toHaveBeenCalledWith(2);
});

/** Keep arrows outside the scroll area and real card actions inside its scoped interaction guard. */
function Collection({ action }: { action: () => void }) {
  const [page, setPage] = useState(0);
  return <>
    <ScrollableCardPages page={page} count={3} onChange={setPage} resetKey="rooms" renderPage={(index) =>
      <Pressable accessibilityLabel={`Open card ${index}`} onPress={action}><Text>{`Card ${index}`}</Text></Pressable>} />
    <Pressable accessibilityLabel="Next cards" onPress={() => setPage(page + 1)}><Text>Next</Text></Pressable>
  </>;
}

test('the measured content is a bounded horizontal list, hides adjacent pages and preserves action isolation', () => {
  const action = jest.fn();
  const screen = render(<Collection action={action} />);
  fireEvent(screen.getByTestId('scrollable-card-pages'), 'layout', { nativeEvent: { layout: { width: 300, height: 240 } } });
  const list = screen.UNSAFE_getByType(FlatList);
  expect(list.props.horizontal).toBe(true);
  expect(list.props.pagingEnabled).toBe(true);
  expect(list.props.windowSize).toBe(3);
  expect(list.props.getItemLayout(undefined, 2)).toEqual({ length: 300, offset: 600, index: 2 });
  expect(screen.getByTestId('scrollable-card-pages-page-1', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
  fireEvent.press(screen.getByLabelText('Open card 0'));
  expect(action).toHaveBeenCalledTimes(1);
  fireEvent(list, 'scrollBeginDrag');
  fireEvent.press(screen.getByLabelText('Open card 0'));
  expect(action).toHaveBeenCalledTimes(1);
  fireEvent(list, 'momentumScrollEnd', offset(300));
  expect(screen.getByTestId('scrollable-card-pages-page-1').props.accessibilityElementsHidden).toBe(false);
  fireEvent.press(screen.getByLabelText('Open card 1'));
  expect(action).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(181));
  fireEvent.press(screen.getByLabelText('Open card 1'));
  expect(action).toHaveBeenCalledTimes(2);
});

test('single-page content stays readable without a scroll surface', () => {
  const screen = render(<ScrollableCardPages page={8} count={1} onChange={jest.fn()} resetKey="one" renderPage={() => <Text>Only room</Text>} />);
  expect(screen.getByTestId('scrollable-card-pages-page-0')).toBeTruthy();
  expect(screen.UNSAFE_queryAllByType(FlatList)).toHaveLength(0);
});
