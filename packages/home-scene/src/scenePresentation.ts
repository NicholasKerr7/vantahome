export const SCENE_PRESENTATION_CHANNEL = "vantahome-scene-presentation";

export type ScenePresentationMessage = {
  channel: typeof SCENE_PRESENTATION_CHANNEL;
  version: 1;
  suspended: boolean;
};

/** Share presentation state only; this channel cannot carry device or account commands. */
export function scenePresentationMessage(
  suspended: boolean,
): ScenePresentationMessage {
  return { channel: SCENE_PRESENTATION_CHANNEL, version: 1, suspended };
}

/** Reject extra keys and coerced values before changing the renderer's lifecycle. */
export function parseScenePresentation(
  input: unknown,
): ScenePresentationMessage | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).sort().join(",") !== "channel,suspended,version" ||
    value.channel !== SCENE_PRESENTATION_CHANNEL ||
    value.version !== 1 ||
    typeof value.suspended !== "boolean"
  )
    return null;
  return value as ScenePresentationMessage;
}

/** Inject a fixed, validated boolean into the packaged native document. */
export function nativeScenePresentationScript(suspended: boolean): string {
  return `window.dispatchEvent(new CustomEvent('${SCENE_PRESENTATION_CHANNEL}',{detail:${JSON.stringify(scenePresentationMessage(suspended))}}));true;`;
}

/** Receive presentation changes from the exact containing web frame or native host event. */
export function subscribeScenePresentation(
  target: Window,
  receive: (suspended: boolean) => void,
): () => void {
  const native = Boolean(
    (target as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView,
  );
  /** Validate the narrow envelope independently from its transport. */
  function accept(input: unknown): void {
    const message = parseScenePresentation(input);
    if (message) receive(message.suspended);
  }
  /** Opaque-origin frames must verify their parent window rather than an origin string. */
  function onWebMessage(event: MessageEvent<unknown>): void {
    if (!native && target.parent !== target && event.source === target.parent)
      accept(event.data);
  }
  /** Only a native document accepts the injected presentation event. */
  function onNativeMessage(event: Event): void {
    if (native) accept((event as CustomEvent<unknown>).detail);
  }
  target.addEventListener("message", onWebMessage);
  target.addEventListener(SCENE_PRESENTATION_CHANNEL, onNativeMessage);
  return () => {
    target.removeEventListener("message", onWebMessage);
    target.removeEventListener(SCENE_PRESENTATION_CHANNEL, onNativeMessage);
  };
}
