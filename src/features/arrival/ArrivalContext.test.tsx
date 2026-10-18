import React from 'react';
import { act, render, renderHook } from '@testing-library/react-native';
import { ArrivalContext, useArrivalCoordinator, useSceneArrival, type ArrivalSceneStatus } from './ArrivalContext';

type Coordinator = ReturnType<typeof useArrivalCoordinator>;
type PublisherProps = {
  status: ArrivalSceneStatus;
  rendererKey: string;
  focused: boolean;
  openControls: () => void;
};

/** Exercise the real layout-effect lease lifecycle without loading a renderer. */
function Publisher({ status, rendererKey, focused, openControls }: PublisherProps) {
  useSceneArrival(status, rendererKey, focused, openControls);
  return null;
}

/** Supply a scope-changing host and expose its latest committed coordinator. */
function Harness({ scope, publisher, observe }: {
  scope: string;
  publisher: PublisherProps | null;
  observe: (value: Coordinator) => void;
}) {
  const coordinator = useArrivalCoordinator(scope);
  React.useLayoutEffect(() => observe(coordinator), [coordinator, observe]);
  return <ArrivalContext.Provider value={coordinator.context}>
    {publisher ? <Publisher {...publisher} /> : null}
  </ArrivalContext.Provider>;
}

test('waits for an actual renderer publication instead of manufacturing readiness', () => {
  const { result } = renderHook(() => useArrivalCoordinator('owner:home'));
  expect(result.current.scene).toBeNull();
  expect(result.current.dismissed).toBe(false);
  act(() => result.current.showControls());
  expect(result.current.scene).toBeNull();
  expect(result.current.initialArrivalComplete).toBe(false);
});

test.each(['ready', 'available'] as const)('a current %s scene completes only this scope and later reloads stay local', (status) => {
  const { result } = renderHook(() => useArrivalCoordinator('owner:home'));
  const first = result.current.context.register();
  act(() => first.publish({ status, openControls: jest.fn() }));
  expect(result.current.initialArrivalComplete).toBe(true);
  act(() => first.release());
  expect(result.current.scene).toBeNull();
  const replacement = result.current.context.register();
  act(() => replacement.publish({ status: 'loading', openControls: jest.fn() }));
  expect(result.current.scene?.status).toBe('loading');
  expect(result.current.initialArrivalComplete).toBe(true);
});

test('an initial error or a replaced renderer cannot complete the introduction', () => {
  const { result } = renderHook(() => useArrivalCoordinator('owner:home'));
  const previous = result.current.context.register();
  const current = result.current.context.register();
  act(() => {
    previous.publish({ status: 'ready', openControls: jest.fn() });
    current.publish({ status: 'error', openControls: jest.fn() });
  });
  expect(result.current.initialArrivalComplete).toBe(false);
});

test.each(['guest:home:1', 'owner:other-home:1', 'owner:home:2'])('changing scope to %s requires a fresh arrival, including when returning to the earlier scope', (scope) => {
  const { result, rerender } = renderHook<Coordinator, { currentScope: string }>(({ currentScope }) => useArrivalCoordinator(currentScope), {
    initialProps: { currentScope: 'owner:home:1' },
  });
  const previous = result.current.context.register();
  act(() => previous.publish({ status: 'ready', openControls: jest.fn() }));
  expect(result.current.initialArrivalComplete).toBe(true);
  rerender({ currentScope: scope });
  expect(result.current.initialArrivalComplete).toBe(false);
  act(() => previous.publish({ status: 'ready', openControls: jest.fn() }));
  expect(result.current.initialArrivalComplete).toBe(false);
  rerender({ currentScope: 'owner:home:1' });
  expect(result.current.initialArrivalComplete).toBe(false);
  act(() => previous.publish({ status: 'ready', openControls: jest.fn() }));
  expect(result.current.scene).toBeNull();
  expect(result.current.initialArrivalComplete).toBe(false);
});

test('ignores a replaced renderer’s late publication and release', () => {
  const { result } = renderHook(() => useArrivalCoordinator('owner:home'));
  const previous = result.current.context.register();
  const current = result.current.context.register();
  const openControls = jest.fn();
  act(() => current.publish({ status: 'loading', openControls }));
  act(() => {
    previous.publish({ status: 'ready', openControls: jest.fn() });
    previous.release();
  });
  expect(result.current.scene?.status).toBe('loading');
  act(() => result.current.showControls());
  expect(openControls).toHaveBeenCalledTimes(1);
  expect(result.current.dismissed).toBe(true);
  expect(result.current.scene?.status).toBe('loading');
});

test('controls escape dismisses only its loading lease and never claims readiness', () => {
  const { result } = renderHook(() => useArrivalCoordinator('owner:home'));
  const openControls = jest.fn();
  const first = result.current.context.register();
  act(() => first.publish({ status: 'loading', openControls }));
  act(() => result.current.showControls());
  expect(result.current.dismissed).toBe(true);
  expect(result.current.scene?.status).toBe('loading');
  const replacement = result.current.context.register();
  act(() => replacement.publish({ status: 'loading', openControls }));
  expect(result.current.dismissed).toBe(false);
  act(() => first.publish({ status: 'ready', openControls }));
  expect(result.current.scene?.status).toBe('loading');
});

test.each(['ready', 'error', 'available'] as const)('does not expose a loading escape from %s', (status) => {
  const { result } = renderHook(() => useArrivalCoordinator('owner:home'));
  const lease = result.current.context.register();
  const openControls = jest.fn();
  act(() => lease.publish({ status, openControls }));
  act(() => result.current.showControls());
  expect(openControls).not.toHaveBeenCalled();
  expect(result.current.dismissed).toBe(false);
  expect(result.current.scene?.status).toBe(status);
});

test('hides a previous account snapshot and rejects its controls during a scope switch', () => {
  const { result, rerender } = renderHook<Coordinator, { scope: string }>(({ scope }) => useArrivalCoordinator(scope), {
    initialProps: { scope: 'owner:home-a' },
  });
  const previous = result.current.context.register();
  const oldControls = jest.fn();
  act(() => previous.publish({ status: 'loading', openControls: oldControls }));
  rerender({ scope: 'guest:home-b' });
  expect(result.current.scene).toBeNull();
  act(() => {
    previous.publish({ status: 'ready', openControls: oldControls });
    result.current.showControls();
  });
  expect(result.current.scene).toBeNull();
  expect(oldControls).not.toHaveBeenCalled();
  const current = result.current.context.register();
  act(() => current.publish({ status: 'loading', openControls: jest.fn() }));
  expect(result.current.scene?.scope).toBe('guest:home-b');
  expect(result.current.scene?.status).toBe('loading');
});

test('focus loss releases readiness and refocusing acquires an undismissed lease', () => {
  let current!: Coordinator;
  const observe = (value: Coordinator) => { current = value; };
  const publisher: PublisherProps = {
    status: 'loading', rendererKey: 'home:0', focused: true, openControls: jest.fn(),
  };
  const screen = render(<Harness scope="owner:home" publisher={publisher} observe={observe} />);
  act(() => current.showControls());
  expect(current.dismissed).toBe(true);
  screen.rerender(<Harness scope="owner:home" publisher={{ ...publisher, focused: false }} observe={observe} />);
  expect(current.scene).toBeNull();
  screen.rerender(<Harness scope="owner:home" publisher={publisher} observe={observe} />);
  expect(current.scene?.status).toBe('loading');
  expect(current.dismissed).toBe(false);
  screen.rerender(<Harness scope="owner:home" publisher={null} observe={observe} />);
  expect(current.scene).toBeNull();
});

test('a mounted publisher rebinds to the new home without carrying dismissal or stale controls', () => {
  let current!: Coordinator;
  const observe = (value: Coordinator) => { current = value; };
  const oldControls = jest.fn();
  const nextControls = jest.fn();
  const publisher: PublisherProps = {
    status: 'loading', rendererKey: 'home-a:0', focused: true, openControls: oldControls,
  };
  const screen = render(<Harness scope="owner:home-a" publisher={publisher} observe={observe} />);
  act(() => current.showControls());
  expect(oldControls).toHaveBeenCalledTimes(1);
  screen.rerender(<Harness scope="guest:home-b" publisher={{
    ...publisher, rendererKey: 'home-b:0', openControls: nextControls,
  }} observe={observe} />);
  expect(current.scene?.scope).toBe('guest:home-b');
  expect(current.scene?.status).toBe('loading');
  expect(current.dismissed).toBe(false);
  act(() => current.showControls());
  expect(oldControls).toHaveBeenCalledTimes(1);
  expect(nextControls).toHaveBeenCalledTimes(1);
  screen.unmount();
});

test('renderer retry resets dismissal even when the account and home stay unchanged', () => {
  let current!: Coordinator;
  const observe = (value: Coordinator) => { current = value; };
  const publisher: PublisherProps = {
    status: 'loading', rendererKey: 'home:0', focused: true, openControls: jest.fn(),
  };
  const screen = render(<Harness scope="owner:home" publisher={publisher} observe={observe} />);
  act(() => current.showControls());
  screen.rerender(<Harness scope="owner:home" publisher={{ ...publisher, rendererKey: 'home:1' }} observe={observe} />);
  expect(current.scene?.status).toBe('loading');
  expect(current.dismissed).toBe(false);
  screen.unmount();
});

test('standalone renderers retain their existing local loading presentation', () => {
  const { result } = renderHook(() => useSceneArrival('loading', 'standalone', true, jest.fn()));
  expect(result.current).toBe(false);
});

test('StrictMode remount cleanup cannot release the replacement renderer lease', () => {
  let current!: Coordinator;
  const observe = (value: Coordinator) => { current = value; };
  const publisher: PublisherProps = {
    status: 'ready', rendererKey: 'home:0', focused: true, openControls: jest.fn(),
  };
  const screen = render(<React.StrictMode>
    <Harness scope="owner:home" publisher={publisher} observe={observe} />
  </React.StrictMode>);
  expect(current.scene?.status).toBe('ready');
  expect(current.scene?.scope).toBe('owner:home');
  expect(current.initialArrivalComplete).toBe(true);
  screen.unmount();
});
