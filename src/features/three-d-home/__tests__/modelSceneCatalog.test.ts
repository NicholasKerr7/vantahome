import { DEVICES } from "../../../../packages/home-scene/src/data";
import { MODEL_SCENE_PRESETS } from "../../../../packages/home-scene/src/modelScenePresets";
import {
  SCENE_CATALOG_CHANNEL,
  parseSceneCatalogMessage,
  type SceneCatalogMessage,
} from "../../../../packages/home-scene/src/sceneCatalogProtocol";
import { createDefaultSimulationSnapshot } from "../../../../packages/home-scene/src/simulationBridgeProtocol";
import {
  useHomeStore,
  type HomeState,
  type Scene,
} from "../../../store/useHomeStore";
import { upgradeModelHomeCatalog } from "../modelHomeCatalog";
import {
  createModelScenes,
  modelPresetForScene,
  modelSceneCatalog,
  nativeSceneCatalogScript,
  upgradeModelSceneCatalog,
} from "../modelSceneCatalog";

/** Build a local modeled Owner fixture without changing the app's active account. */
function state(overrides: Partial<HomeState> = {}): HomeState {
  const original: HomeState = {
    ...useHomeStore.getInitialState(),
    accountUserId: null,
    authenticatedUserId: null,
    accountHomeId: null,
    activeHomeId: null,
    realtime: { enabled: false, useMqtt: false, wsUrl: "" },
    modelCatalogVersion: undefined,
    modelSceneCatalogVersion: undefined,
    scenes: [],
    household: [{ id: "owner", name: "Owner", role: "Owner", status: "home" }],
    activeMemberId: "owner",
  };
  return {
    ...original,
    ...upgradeModelHomeCatalog(original, createDefaultSimulationSnapshot()),
    ...overrides,
  };
}

const custom: Scene = {
  id: "custom-scene",
  name: "Quiet evening",
  scope: "home",
  roomId: "",
  actions: [{ type: "toggle", deviceId: "living-light", on: false }],
};

test("seeds the original four presets as stable editable native scene records", () => {
  const scenes = createModelScenes();
  expect(scenes.map(({ id, name }) => ({ id, name }))).toEqual(
    MODEL_SCENE_PRESETS.map(({ sceneId, name }) => ({ id: sceneId, name })),
  );
  for (const scene of scenes) {
    expect(scene.scope).toBe("home");
    expect(scene.actions).toHaveLength(DEVICES.length - 2);
    expect(
      scene.actions.some((action) =>
        ["utility-gas-meter", "kitchen-gas-leak"].includes(action.deviceId),
      ),
    ).toBe(false);
    expect(new Set(scene.actions.map((action) => action.deviceId)).size).toBe(
      scene.actions.length,
    );
    for (const action of scene.actions)
      if (action.type === "patch") {
        expect(action.patch).not.toHaveProperty("powerW");
        expect(action.patch).not.toHaveProperty("smokeDetected");
        expect(action.patch).not.toHaveProperty("waterLeakDetected");
        expect(action.patch).not.toHaveProperty("observedAt");
      }
  }
  expect(
    scenes[1].actions.find((action) => action.deviceId === "living-light"),
  ).toMatchObject({ type: "patch", patch: { brightness: 18, isOn: true } });
  expect(
    scenes[1].actions.find((action) => action.deviceId === "master-blinds"),
  ).toMatchObject({ type: "patch", patch: { openPercent: 0, isOn: false } });
});

test("preserves custom scenes, same-name scenes and canonical-ID collisions without guessing", () => {
  const collision = {
    ...custom,
    id: "model-scene:morning",
    name: "My morning",
  };
  const before = state({
    scenes: [
      custom,
      collision,
      { ...custom, id: "same-name", name: "Movie time" },
    ],
  });
  const update = upgradeModelSceneCatalog(before, "demo");
  expect(update.scenes).toHaveLength(6);
  expect(update.scenes?.slice(0, 3)).toEqual(before.scenes);
  expect(
    update.scenes?.filter((scene) => scene.id === "model-scene:morning"),
  ).toEqual([collision]);
  expect(before.scenes).toHaveLength(3);
});

test("does not duplicate or resurrect deleted defaults on subsequent hydration", () => {
  const initial = state();
  const seeded = { ...initial, ...upgradeModelSceneCatalog(initial, "demo") };
  expect(upgradeModelSceneCatalog(seeded, "demo")).toEqual({});
  const removed = {
    ...seeded,
    scenes: seeded.scenes.filter((scene) => scene.id !== "model-scene:movie"),
  };
  expect(upgradeModelSceneCatalog(removed, "demo")).toEqual({});
  expect(removed.scenes).toHaveLength(3);
});

test.each([
  "accountUserId",
  "authenticatedUserId",
  "accountHomeId",
  "activeHomeId",
] as const)("never seeds or shares account data through %s", (field) => {
  const real = state({ [field]: "private-account", scenes: [custom] });
  expect(upgradeModelSceneCatalog(real, "demo")).toEqual({});
  expect(modelSceneCatalog(real, "demo")).toEqual({
    scenes: [],
    activeSceneId: null,
  });
  expect(modelPresetForScene(real, createModelScenes()[0], "demo")).toBeNull();
});

test("allows preset semantics only for its known ID, local Owner scope and demo mode", () => {
  const owner = state();
  const scene = createModelScenes()[0];
  expect(modelPresetForScene(owner, scene, "demo")).toBe("morning");
  expect(
    modelPresetForScene(owner, { ...scene, id: "custom" }, "demo"),
  ).toBeNull();
  expect(
    modelPresetForScene(owner, { ...scene, modelPreset: undefined }, "demo"),
  ).toBeNull();
  expect(modelPresetForScene(owner, scene, "production")).toBeNull();
  expect(
    modelPresetForScene({ ...owner, activeMemberId: "missing" }, scene, "demo"),
  ).toBeNull();
  expect(
    modelPresetForScene(
      { ...owner, household: [{ ...owner.household[0], role: "Guest" }] },
      scene,
      "demo",
    ),
  ).toBeNull();
  expect(
    modelPresetForScene(
      { ...owner, realtime: { ...owner.realtime, enabled: true } },
      scene,
      "demo",
    ),
  ).toBeNull();
});

test("shares current custom labels and active identity without actions or device metadata", () => {
  const owner = state({
    scenes: [
      custom,
      {
        ...custom,
        id: "unavailable",
        actions: [{ type: "toggle", deviceId: "unknown", on: false }],
      },
    ],
    activeSceneId: custom.id,
  });
  const catalog = modelSceneCatalog(owner, "demo");
  expect(catalog).toEqual({
    scenes: [
      { id: custom.id, name: custom.name, scope: "Whole home", deviceCount: 1 },
    ],
    activeSceneId: custom.id,
  });
  expect(JSON.stringify(catalog)).not.toContain("living-light");
  const message: SceneCatalogMessage = {
    channel: SCENE_CATALOG_CHANNEL,
    version: 1,
    type: "catalog",
    catalog,
  };
  expect(parseSceneCatalogMessage(message)).toEqual(message);
  const malicious = {
    ...message,
    catalog: {
      ...catalog,
      scenes: [
        { ...catalog.scenes[0], name: "</script><script>alert(1)</script>" },
      ],
    },
  };
  expect(nativeSceneCatalogScript(malicious)).not.toContain("</script>");
});
