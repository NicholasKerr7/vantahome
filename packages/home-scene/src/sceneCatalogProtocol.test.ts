import { describe, expect, it } from "vitest";
import {
  MAX_SCENE_CATALOG_BYTES,
  MAX_SCENE_CATALOG_ITEMS,
  SCENE_CATALOG_CHANNEL,
  parseSceneCatalogMessage,
  parseSceneCatalogRequest,
} from "./sceneCatalogProtocol";

const base = { channel: SCENE_CATALOG_CHANNEL, version: 1 };
const scene = {
  id: "custom-scene",
  name: "Quiet evening",
  scope: "Whole home",
  deviceCount: 3,
};

describe("saved scene catalog protocol", () => {
  it("accepts identical native and web metadata without transporting actions", () => {
    const message = {
      ...base,
      type: "catalog",
      catalog: { scenes: [scene], activeSceneId: scene.id },
    };
    expect(parseSceneCatalogMessage(message)).toEqual(message);
    expect(parseSceneCatalogMessage(JSON.stringify(message))).toEqual(message);
    expect(parseSceneCatalogRequest({ ...base, type: "request" })).toEqual({
      ...base,
      type: "request",
    });
    expect(
      parseSceneCatalogRequest({
        ...base,
        type: "run",
        sceneId: scene.id,
        requestId: 1,
      }),
    ).toMatchObject({ sceneId: scene.id, requestId: 1 });
  });

  it("rejects action injection, unknown envelope fields, coercion and malformed identities", () => {
    for (const value of [
      { ...base, type: "run", sceneId: scene.id, requestId: 1, actions: [] },
      { ...base, type: "run", sceneId: "", requestId: 1 },
      { ...base, type: "run", sceneId: scene.id, requestId: 0 },
      { ...base, type: "run", sceneId: scene.id, requestId: "1" },
      {
        ...base,
        type: "run",
        sceneId: scene.id,
        requestId: Number.MAX_SAFE_INTEGER + 1,
      },
      { ...base, type: "request", accountId: "secret" },
      "{",
      "x".repeat(MAX_SCENE_CATALOG_BYTES + 1),
    ])
      expect(parseSceneCatalogRequest(value)).toBeNull();
  });

  it("rejects duplicate, oversized, private or inconsistent catalogs atomically", () => {
    for (const catalog of [
      { scenes: [scene, scene], activeSceneId: null },
      { scenes: [{ ...scene, actions: [] }], activeSceneId: null },
      { scenes: [{ ...scene, name: "x".repeat(121) }], activeSceneId: null },
      { scenes: [{ ...scene, deviceCount: -1 }], activeSceneId: null },
      { scenes: [scene], activeSceneId: "unknown" },
      { scenes: [scene], activeSceneId: null, household: [] },
    ])
      expect(
        parseSceneCatalogMessage({ ...base, type: "catalog", catalog }),
      ).toBeNull();
  });

  it("fits a complete maximum-sized catalog including worst-case JSON escaping", () => {
    const scenes = Array.from(
      { length: MAX_SCENE_CATALOG_ITEMS },
      (_, index) => ({
        id: `${index}`.padEnd(160, "\\"),
        name: '"'.repeat(120),
        scope: "\\".repeat(120),
        deviceCount: 1024,
      }),
    );
    const message = {
      ...base,
      type: "catalog",
      catalog: { scenes, activeSceneId: null },
    };
    expect(JSON.stringify(message).length).toBeLessThan(
      MAX_SCENE_CATALOG_BYTES,
    );
    expect(parseSceneCatalogMessage(message)?.catalog.scenes).toHaveLength(
      MAX_SCENE_CATALOG_ITEMS,
    );
  });
});
