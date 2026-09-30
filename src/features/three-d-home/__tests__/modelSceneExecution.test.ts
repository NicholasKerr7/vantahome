import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useHomeStore,
  hydrateHomeAccount,
  type HomeState,
} from "../../../store/useHomeStore";
import { createDefaultSimulationSnapshot } from "../../../../packages/home-scene/src/simulationBridgeProtocol";
import { applyModelPreset } from "../../../../packages/home-scene/src/modelScenePresets";
import {
  applyGasCommand,
  readGasSetting,
  synchronizeGasSafety,
} from "../../../../packages/home-scene/src/gasSimulation";
import { readDeviceSetting } from "../../../../packages/home-scene/src/deviceCapabilities";
import { getDevice } from "../../../../packages/home-scene/src/data";
import { simulationPersistence } from "../simulationPersistence";
import {
  modelSceneCatalog,
  upgradeModelSceneCatalog,
} from "../modelSceneCatalog";
import {
  projectModelSnapshot,
  upgradeModelHomeCatalog,
} from "../modelHomeCatalog";
import { SimulationSession } from "../simulationSession";

/** Hydrate an independent canonical local home before exercising the real store actions. */
beforeEach(async () => {
  await AsyncStorage.clear();
  simulationPersistence.save("demo", createDefaultSimulationSnapshot());
  await hydrateHomeAccount(null, true);
  const current = useHomeStore.getState();
  const base: HomeState = {
    ...current,
    scenes: [],
    rules: [],
    flows: [],
    modelSceneCatalogVersion: undefined,
    household: [{ id: "owner", name: "Owner", role: "Owner", status: "home" }],
    activeMemberId: "owner",
  };
  const canonical = {
    ...base,
    ...upgradeModelHomeCatalog(base, createDefaultSimulationSnapshot()),
  };
  useHomeStore.setState({
    ...canonical,
    ...upgradeModelSceneCatalog(canonical, "demo"),
  });
});

/** Drain local transport and serialized persistence work without time-dependent sleeps. */
async function settle() {
  for (let index = 0; index < 24; index += 1) await Promise.resolve();
}

test("native execution preserves original preset atmosphere and gas safety, including saved reload state", async () => {
  const defaults = createDefaultSimulationSnapshot();
  const leak = applyGasCommand(
    "gas-leak",
    defaults.deviceStates["kitchen-gas-leak"],
    "simulate-leak",
  );
  const before = {
    ...defaults,
    deviceStates: synchronizeGasSafety({
      ...defaults.deviceStates,
      "kitchen-gas-leak": leak,
    }),
  };
  before.deviceStates["living-light"] = {
    on: true,
    level: 95,
    settings: { lightEffect: "party", color: "#FF9AA2" },
  };
  before.deviceStates["entry-gate"].settings = { autoOpenEnabled: false };
  simulationPersistence.save("demo", before);
  useHomeStore.setState({
    devices: projectModelSnapshot(useHomeStore.getState().devices, before),
  });
  await useHomeStore.getState().runScene("model-scene:movie");
  const saved = await simulationPersistence.load("demo");
  expect(saved).toEqual(applyModelPreset(before, "movie"));
  expect(saved).toMatchObject({ night: true, lightingMode: "night" });
  expect(
    readGasSetting(
      "gas-leak",
      saved.deviceStates["kitchen-gas-leak"],
      "gasLeakDetected",
    ),
  ).toBe(true);
  expect(
    readGasSetting(
      "gas-meter",
      saved.deviceStates["utility-gas-meter"],
      "gasValveOpen",
    ),
  ).toBe(false);
  expect(
    useHomeStore
      .getState()
      .devices.find((device) => device.id === "living-light"),
  ).toMatchObject({ brightness: 18, isOn: true });
  expect(
    useHomeStore
      .getState()
      .devices.find((device) => device.id === "living-light")?.lightEffect,
  ).toBeUndefined();
  expect(useHomeStore.getState().lastSceneRun?.sceneId).toBe(
    "model-scene:movie",
  );
  await settle();
  await hydrateHomeAccount(null, true);
  expect(useHomeStore.getState().activeSceneId).toBe("model-scene:movie");
  expect(useHomeStore.getState().scenes).toHaveLength(4);
  expect((await simulationPersistence.load("demo")).night).toBe(true);
});

test("edited defaults execute their saved actions and deletions remain absent after rehydration", async () => {
  const edited = "model-scene:night";
  useHomeStore
    .getState()
    .updateScene(edited, {
      name: "My quiet scene",
      actions: [
        {
          type: "patch",
          deviceId: "living-light",
          patch: { isOn: true, brightness: 37 },
        },
      ],
    });
  expect(
    useHomeStore.getState().scenes.find((scene) => scene.id === edited)
      ?.modelPreset,
  ).toBeUndefined();
  const session = new SimulationSession(
    () => undefined,
    () => undefined,
    { mode: "demo" },
  );
  session.handleMessage({
    channel: "vantahome-simulation",
    version: 1,
    type: "request",
  });
  await settle();
  await useHomeStore.getState().runScene(edited);
  expect(
    (await simulationPersistence.load("demo")).deviceStates["living-light"]
      .level,
  ).toBe(37);
  expect((await simulationPersistence.load("demo")).night).toBe(false);
  useHomeStore.setState({
    scenes: useHomeStore
      .getState()
      .scenes.filter((scene) => scene.id !== "model-scene:morning"),
  });
  session.dispose();
  await settle();
  await hydrateHomeAccount(null, true);
  expect(useHomeStore.getState().scenes).toHaveLength(3);
  expect(
    useHomeStore.getState().scenes.find((scene) => scene.id === edited)?.name,
  ).toBe("My quiet scene");
  expect(
    useHomeStore
      .getState()
      .scenes.some((scene) => scene.id === "model-scene:morning"),
  ).toBe(false);
});

test("a normalized no-op action save and rename retain authored atmosphere, but scope changes detach it", async () => {
  const scene = useHomeStore
    .getState()
    .scenes.find((entry) => entry.id === "model-scene:night")!;
  const actions = scene.actions.map((action) =>
    action.type === "patch"
      ? {
          ...action,
          patch: {
            colorTempK: undefined,
            ...Object.fromEntries(Object.entries(action.patch).reverse()),
          },
        }
      : { ...action },
  );
  useHomeStore.getState().updateScene(scene.id, { name: "Rest", actions });
  expect(
    useHomeStore.getState().scenes.find((entry) => entry.id === scene.id)
      ?.modelPreset,
  ).toBe("night");
  await useHomeStore.getState().runScene(scene.id);
  expect((await simulationPersistence.load("demo")).night).toBe(true);
  useHomeStore
    .getState()
    .updateScene(scene.id, { scope: "room", roomId: "living" });
  expect(
    useHomeStore.getState().scenes.find((entry) => entry.id === scene.id)
      ?.modelPreset,
  ).toBeUndefined();
});

test("a pending native gas update remains authoritative before the sync session has mounted", async () => {
  useHomeStore
    .getState()
    .setDevice("kitchen-gas-leak", {
      gasLeakDetected: true,
      gasConcentrationPercentLel: 35,
      gasAlarmSilenced: false,
    });
  await useHomeStore.getState().runScene("model-scene:morning");
  const saved = await simulationPersistence.load("demo");
  expect(
    readGasSetting(
      "gas-leak",
      saved.deviceStates["kitchen-gas-leak"],
      "gasLeakDetected",
    ),
  ).toBe(true);
  expect(
    readGasSetting(
      "gas-meter",
      saved.deviceStates["utility-gas-meter"],
      "gasValveOpen",
    ),
  ).toBe(false);
});

test("scene runs retain the native routine event and update the renderer through the existing bridge", async () => {
  const deliveries = jest.fn();
  const session = new SimulationSession(deliveries, () => undefined, {
    mode: "demo",
  });
  session.handleMessage({
    channel: "vantahome-simulation",
    version: 1,
    type: "request",
  });
  await settle();
  const observer = jest.fn();
  const unsubscribe = useHomeStore.subscribe((next, previous) => {
    if (next.lastSceneRun !== previous.lastSceneRun)
      observer(next.lastSceneRun);
  });
  await useHomeStore.getState().runScene("model-scene:away");
  await settle();
  expect(observer).toHaveBeenCalledTimes(1);
  expect(observer).toHaveBeenCalledWith(
    expect.objectContaining({ sceneId: "model-scene:away" }),
  );
  const state = deliveries.mock.lastCall?.[0].state;
  expect(state.deviceStates["master-blinds"]).toMatchObject({
    level: 0,
    on: false,
  });
  expect(
    readDeviceSetting(
      getDevice("entry-camera")!,
      state.deviceStates["entry-camera"],
      "armed",
    ),
  ).toBe(true);
  expect(modelSceneCatalog(useHomeStore.getState(), "demo").activeSceneId).toBe(
    "model-scene:away",
  );
  unsubscribe();
  session.dispose();
});

test("a scene queued before an account transition cannot apply its preset to the new home", async () => {
  const run = useHomeStore.getState().runScene("model-scene:night");
  await hydrateHomeAccount("real-owner");
  await run;
  expect(useHomeStore.getState().accountUserId).toBe("real-owner");
  expect(useHomeStore.getState().devices).toEqual([]);
  expect(useHomeStore.getState().modelSceneCatalogVersion).toBeUndefined();
  expect(useHomeStore.getState().activeSceneId).toBeNull();
});

test("a queued preset cannot cross a change between two simulated Owner identities", async () => {
  const run = useHomeStore.getState().runScene("model-scene:night");
  useHomeStore.setState({
    activeMemberId: "other-owner",
    household: [
      { id: "other-owner", name: "Other", role: "Owner", status: "home" },
    ],
  });
  await run;
  expect(useHomeStore.getState().activeSceneId).toBeNull();
  expect((await simulationPersistence.load("demo")).night).toBe(false);
});

test("a modeled Admin cannot fall through to generic native scene execution", async () => {
  useHomeStore.setState({
    household: [{ id: "owner", name: "Admin", role: "Admin", status: "home" }],
  });
  const before = useHomeStore.getState();
  const saved = await simulationPersistence.load("demo");
  await expect(before.runScene("model-scene:night")).rejects.toThrow(
    "local home owner",
  );
  expect(useHomeStore.getState().devices).toBe(before.devices);
  expect(useHomeStore.getState().activeSceneId).toBeNull();
  expect(await simulationPersistence.load("demo")).toBe(saved);
});

test("account persistence omits local preset metadata even if a foreign cache supplies it", async () => {
  const local = useHomeStore.getState().scenes[0];
  await hydrateHomeAccount("real-owner");
  useHomeStore.setState({ scenes: [local] });
  await settle();
  const saved = await AsyncStorage.getItem("vantahome-store:user:real-owner");
  expect(saved).not.toContain("modelPreset");
  expect(saved).not.toContain("modelSceneCatalogVersion");
});
