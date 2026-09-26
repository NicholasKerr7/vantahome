import { describe, expect, it, vi } from 'vitest';
import { connectSimulationBridgeTransport } from './simulationBridgeTransport';
import { SIMULATION_CHANNEL, type SimulationRequest } from './simulationBridgeProtocol';

/** Provide deterministic window events without a browser or a permissive same-origin test iframe. */
function fakeWindow(native = false) {
  const listeners = new Map<string, EventListener>();
  const parent = { postMessage: vi.fn() };
  const nativeHost = { postMessage: vi.fn() };
  const value = {
    parent,
    ReactNativeWebView: native ? nativeHost : undefined,
    addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  };
  return {
    target: value as unknown as Window, parent, nativeHost, listeners,
    emit(name: string, event: unknown): void { listeners.get(name)?.(event as Event); },
  };
}
const request: SimulationRequest = { channel: SIMULATION_CHANNEL, version: 1, type: 'request' };

describe('simulation transport identity', () => {
  it('accepts web messages only from its containing parent and removes all listeners', () => {
    const browser = fakeWindow();
    const receive = vi.fn();
    const transport = connectSimulationBridgeTransport(browser.target, receive);
    browser.emit('message', { source: {}, data: request });
    browser.emit(SIMULATION_CHANNEL, { detail: request });
    expect(receive).not.toHaveBeenCalled();
    browser.emit('message', { source: browser.parent, data: request });
    expect(receive).toHaveBeenCalledWith(request);
    transport.send(request);
    expect(browser.parent.postMessage).toHaveBeenCalledWith(request, '*');
    transport.dispose();
    expect(browser.listeners.size).toBe(0);
  });

  it('uses native JSON requests and accepts only the injected native event', () => {
    const browser = fakeWindow(true);
    const receive = vi.fn();
    const transport = connectSimulationBridgeTransport(browser.target, receive);
    browser.emit('message', { source: browser.parent, data: request });
    expect(receive).not.toHaveBeenCalled();
    browser.emit(SIMULATION_CHANNEL, { detail: request });
    expect(receive).toHaveBeenCalledWith(request);
    transport.send(request);
    expect(browser.nativeHost.postMessage).toHaveBeenCalledWith(JSON.stringify(request));
    expect(browser.parent.postMessage).not.toHaveBeenCalled();
  });
});
