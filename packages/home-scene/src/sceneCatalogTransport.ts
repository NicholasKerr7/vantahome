import {
  SCENE_CATALOG_CHANNEL,
  type SceneCatalogRequest,
} from "./sceneCatalogProtocol";

type NativeWindow = Window & {
  ReactNativeWebView?: { postMessage: (message: string) => void };
};

/** Isolate catalog messages to the exact native host or parent frame, independently of simulation data. */
export function connectSceneCatalogTransport(
  target: Window,
  receive: (input: unknown) => void,
) {
  const native = (target as NativeWindow).ReactNativeWebView;
  /** An opaque-origin frame trusts its containing window identity, never an arbitrary message origin. */
  function webMessage(event: MessageEvent<unknown>) {
    if (!native && target.parent !== target && event.source === target.parent)
      receive(event.data);
  }
  /** Native messages still undergo schema validation in the catalog client. */
  function nativeMessage(event: Event) {
    if (native) receive((event as CustomEvent<unknown>).detail);
  }
  target.addEventListener("message", webMessage);
  target.addEventListener(SCENE_CATALOG_CHANNEL, nativeMessage);
  return {
    /** Transmit intent only; the host resolves scene actions from its current catalog. */
    send(message: SceneCatalogRequest) {
      if (native) native.postMessage(JSON.stringify(message));
      else if (target.parent !== target)
        target.parent.postMessage(message, "*");
    },
    /** Detach listeners before a discarded scene document can receive another account's state. */
    dispose() {
      target.removeEventListener("message", webMessage);
      target.removeEventListener(SCENE_CATALOG_CHANNEL, nativeMessage);
    },
  };
}
