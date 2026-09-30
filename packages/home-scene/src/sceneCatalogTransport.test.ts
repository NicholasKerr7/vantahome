import { describe, expect, it, vi } from "vitest";
import { connectSceneCatalogTransport } from "./sceneCatalogTransport";
import {
  SCENE_CATALOG_CHANNEL,
  type SceneCatalogRequest,
} from "./sceneCatalogProtocol";

/** Model browser identity and native injection without granting a same-origin frame exception. */
function host(native: boolean) {
  const listeners = new Map<string, EventListener>();
  const parent = { postMessage: vi.fn() };
  const nativeHost = { postMessage: vi.fn() };
  const target = {
    parent,
    ReactNativeWebView: native ? nativeHost : undefined,
    addEventListener: (name: string, listener: EventListener) =>
      listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  } as unknown as Window;
  return { target, parent, nativeHost, listeners };
}
const request: SceneCatalogRequest = {
  channel: SCENE_CATALOG_CHANNEL,
  version: 1,
  type: "request",
};

describe("scene catalog transport identity", () => {
  it("accepts only its containing web window and removes both listeners", () => {
    const browser = host(false);
    const receive = vi.fn();
    const transport = connectSceneCatalogTransport(browser.target, receive);
    browser.listeners.get("message")?.({
      source: {},
      data: request,
    } as MessageEvent);
    browser.listeners.get(SCENE_CATALOG_CHANNEL)?.({
      detail: request,
    } as CustomEvent);
    expect(receive).not.toHaveBeenCalled();
    browser.listeners.get("message")?.({
      source: browser.parent,
      data: request,
    } as unknown as MessageEvent);
    expect(receive).toHaveBeenCalledWith(request);
    transport.send(request);
    expect(browser.parent.postMessage).toHaveBeenCalledWith(request, "*");
    transport.dispose();
    expect(browser.listeners.size).toBe(0);
  });

  it("accepts only dedicated native events and sends JSON to its host", () => {
    const browser = host(true);
    const receive = vi.fn();
    const transport = connectSceneCatalogTransport(browser.target, receive);
    browser.listeners.get("message")?.({
      source: browser.parent,
      data: request,
    } as unknown as MessageEvent);
    expect(receive).not.toHaveBeenCalled();
    browser.listeners.get(SCENE_CATALOG_CHANNEL)?.({
      detail: request,
    } as CustomEvent);
    expect(receive).toHaveBeenCalledWith(request);
    transport.send(request);
    expect(browser.nativeHost.postMessage).toHaveBeenCalledWith(
      JSON.stringify(request),
    );
    expect(browser.parent.postMessage).not.toHaveBeenCalled();
    transport.dispose();
  });
});
