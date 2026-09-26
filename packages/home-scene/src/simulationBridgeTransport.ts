import { SIMULATION_CHANNEL, type SimulationRequest } from './simulationBridgeProtocol';

type NativeSceneWindow = Window & { ReactNativeWebView?: { postMessage: (message: string) => void } };

/** Bind the bridge to its containing frame or native file host, never to unrelated browser windows. */
export function connectSimulationBridgeTransport(target: Window, receive: (input: unknown) => void): { send: (message: SimulationRequest) => void; dispose: () => void } {
  const nativeHost = (target as NativeSceneWindow).ReactNativeWebView;

  /** Source identity is required because the sandbox deliberately gives the scene an opaque origin. */
  function receiveWeb(event: MessageEvent<unknown>): void {
    if (!nativeHost && event.source === target.parent && target.parent !== target) receive(event.data);
  }

  /** Native responses enter through a single event and still undergo the complete DTO validation. */
  function receiveNative(event: Event): void {
    if (nativeHost) receive((event as CustomEvent<unknown>).detail);
  }

  target.addEventListener('message', receiveWeb);
  target.addEventListener(SIMULATION_CHANNEL, receiveNative);
  return {
    /** Send only validated simulation intentions; native hosts expect the same envelope as JSON. */
    send(message): void {
      if (nativeHost) nativeHost.postMessage(JSON.stringify(message));
      else if (target.parent !== target) target.parent.postMessage(message, '*');
    },
    /** Release document listeners before the graphics document is discarded or remounted. */
    dispose(): void {
      target.removeEventListener('message', receiveWeb);
      target.removeEventListener(SIMULATION_CHANNEL, receiveNative);
    },
  };
}
