import { describe, expect, it, vi } from "vitest";
import {
  SCENE_PRESENTATION_CHANNEL,
  nativeScenePresentationScript,
  parseScenePresentation,
  scenePresentationMessage,
  subscribeScenePresentation,
} from "./scenePresentation";

/** Model only browser identity and listener ownership, with no graphics dependency. */
function fakeHostWindow(native = false) {
  const listeners = new Map<string, EventListener>();
  const parent = {};
  const target = {
    parent,
    ReactNativeWebView: native ? {} : undefined,
    addEventListener: (name: string, listener: EventListener) =>
      listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  } as unknown as Window;
  return {
    target,
    parent,
    listeners,
    emit(name: string, event: unknown) {
      listeners.get(name)?.(event as Event);
    },
  };
}

describe("covered scene presentation", () => {
  it("accepts only explicit pause/resume envelopes, never commands or coerced flags", () => {
    expect(
      parseScenePresentation(scenePresentationMessage(true))?.suspended,
    ).toBe(true);
    expect(
      parseScenePresentation(scenePresentationMessage(false))?.suspended,
    ).toBe(false);
    for (const input of [
      null,
      [],
      "true",
      { suspended: true },
      { ...scenePresentationMessage(true), version: 2 },
      { ...scenePresentationMessage(true), suspended: "true" },
      { ...scenePresentationMessage(true), deviceId: "living-light" },
    ]) {
      expect(parseScenePresentation(input)).toBeNull();
    }
    expect(nativeScenePresentationScript(false)).toContain('"suspended":false');
  });

  it("pauses and resumes only from its actual web parent and cleans up listeners", () => {
    const browser = fakeHostWindow();
    const receive = vi.fn();
    const dispose = subscribeScenePresentation(browser.target, receive);
    browser.emit("message", {
      source: {},
      data: scenePresentationMessage(true),
    });
    browser.emit(SCENE_PRESENTATION_CHANNEL, {
      detail: scenePresentationMessage(true),
    });
    expect(receive).not.toHaveBeenCalled();
    browser.emit("message", {
      source: browser.parent,
      data: scenePresentationMessage(true),
    });
    browser.emit("message", {
      source: browser.parent,
      data: scenePresentationMessage(false),
    });
    expect(receive.mock.calls).toEqual([[true], [false]]);
    dispose();
    expect(browser.listeners.size).toBe(0);
  });

  it("uses only validated injected events in a native WebView", () => {
    const browser = fakeHostWindow(true);
    const receive = vi.fn();
    const dispose = subscribeScenePresentation(browser.target, receive);
    browser.emit("message", {
      source: browser.parent,
      data: scenePresentationMessage(true),
    });
    browser.emit(SCENE_PRESENTATION_CHANNEL, { detail: { suspended: true } });
    expect(receive).not.toHaveBeenCalled();
    browser.emit(SCENE_PRESENTATION_CHANNEL, {
      detail: scenePresentationMessage(true),
    });
    expect(receive).toHaveBeenCalledWith(true);
    dispose();
    expect(browser.listeners.size).toBe(0);
  });
});
