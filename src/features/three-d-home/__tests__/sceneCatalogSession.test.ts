import { createStore } from "zustand/vanilla";
import {
  useHomeStore,
  type HomeState,
  type Scene,
} from "../../../store/useHomeStore";
import { createDefaultSimulationSnapshot } from "../../../../packages/home-scene/src/simulationBridgeProtocol";
import { SCENE_CATALOG_CHANNEL } from "../../../../packages/home-scene/src/sceneCatalogProtocol";
import { upgradeModelHomeCatalog } from "../modelHomeCatalog";
import { SimulationSession } from "../simulationSession";
import { SimulationPersistence } from "../simulationPersistence";

const custom: Scene = {
  id: "custom",
  name: "Custom scene",
  scope: "home",
  roomId: "",
  actions: [{ type: "toggle", deviceId: "living-light", on: false }],
};
const request = { channel: SCENE_CATALOG_CHANNEL, version: 1, type: "request" };

/** Use an isolated local store and storage adapter so no test can target account services. */
function setup(
  overrides: Partial<HomeState> = {},
  mode: "demo" | "production" = "demo",
) {
  const initial: HomeState = {
    ...useHomeStore.getInitialState(),
    accountUserId: null,
    authenticatedUserId: null,
    accountHomeId: null,
    activeHomeId: null,
    sessionEpoch: 1,
    realtime: { enabled: false, useMqtt: false, wsUrl: "" },
    household: [{ id: "owner", name: "Owner", role: "Owner", status: "home" }],
    activeMemberId: "owner",
    scenes: [],
  };
  const runScene = jest.fn(async (id: string) => {
    store.setState({ activeSceneId: id });
  });
  const store = createStore<HomeState>(() => ({
    ...initial,
    ...upgradeModelHomeCatalog(initial, createDefaultSimulationSnapshot()),
    scenes: [custom],
    runScene,
    ...overrides,
  }));
  const deliver = jest.fn();
  const catalog = jest.fn();
  const persistence = new SimulationPersistence({
    getItem: async () => null,
    setItem: async () => undefined,
  });
  const session = new SimulationSession(deliver, jest.fn(), {
    store,
    persistence,
    mode,
    onSceneCatalog: catalog,
  });
  return { store, runScene, catalog, session };
}

/** Drain the ordered request queue and async scene callback deterministically. */
async function settle() {
  for (let index = 0; index < 24; index += 1) await Promise.resolve();
}

test("publishes the native collection and keeps edits, creation, deletion and active scene synchronized", async () => {
  const { session, store, catalog, runScene } = setup();
  session.handleMessage(request);
  await settle();
  expect(catalog.mock.lastCall?.[0].catalog.scenes).toEqual([
    { id: "custom", name: "Custom scene", scope: "Whole home", deviceCount: 1 },
  ]);
  store.setState({
    scenes: [
      { ...custom, name: "Renamed" },
      { ...custom, id: "second", name: "Second" },
    ],
  });
  expect(
    catalog.mock.lastCall?.[0].catalog.scenes.map(
      (scene: { name: string }) => scene.name,
    ),
  ).toEqual(["Renamed", "Second"]);
  session.handleMessage({
    ...request,
    type: "run",
    sceneId: "second",
    requestId: 1,
  });
  await settle();
  expect(runScene).toHaveBeenCalledWith("second");
  expect(catalog.mock.lastCall?.[0].catalog.activeSceneId).toBe("second");
  store.setState({ scenes: [custom] });
  expect(catalog.mock.lastCall?.[0].catalog.activeSceneId).toBeNull();
  expect(catalog.mock.lastCall?.[0].catalog.scenes).toHaveLength(1);
  session.dispose();
});

test("requires the catalog handshake, a current known identity and a fresh request number", async () => {
  const { session, store, runScene } = setup();
  session.handleMessage({
    ...request,
    type: "run",
    sceneId: "custom",
    requestId: 1,
  });
  await settle();
  expect(runScene).not.toHaveBeenCalled();
  session.handleMessage(request);
  await settle();
  session.handleMessage({
    ...request,
    type: "run",
    sceneId: "custom",
    requestId: 2,
  });
  session.handleMessage({
    ...request,
    type: "run",
    sceneId: "custom",
    requestId: 2,
  });
  session.handleMessage({
    ...request,
    type: "run",
    sceneId: "missing",
    requestId: 3,
  });
  await settle();
  expect(runScene).toHaveBeenCalledTimes(1);
  store.setState({ scenes: [] });
  session.handleMessage({
    ...request,
    type: "run",
    sceneId: "custom",
    requestId: 4,
  });
  await settle();
  expect(runScene).toHaveBeenCalledTimes(1);
  session.dispose();
});

test.each([
  { accountUserId: "real" },
  { authenticatedUserId: "real" },
  { accountHomeId: "real" },
  { activeHomeId: "real" },
  { activeMemberId: "missing" },
  { modelCatalogVersion: undefined },
])(
  "does not publish or run private/nonmodeled scenes %#",
  async (overrides) => {
    const { session, runScene, catalog } = setup(overrides);
    session.handleMessage(request);
    session.handleMessage({
      ...request,
      type: "run",
      sceneId: "custom",
      requestId: 1,
    });
    await settle();
    expect(catalog.mock.lastCall?.[0].catalog).toEqual({
      scenes: [],
      activeSceneId: null,
    });
    expect(runScene).not.toHaveBeenCalled();
    session.dispose();
  },
);

test("revocation invalidates an already queued run and production never executes model scenes", async () => {
  const current = setup();
  current.session.handleMessage(request);
  await settle();
  current.session.handleMessage({
    ...request,
    type: "run",
    sceneId: "custom",
    requestId: 1,
  });
  current.store.setState({ authenticatedUserId: "another-account" });
  await settle();
  expect(current.runScene).not.toHaveBeenCalled();
  const production = setup({}, "production");
  production.session.handleMessage(request);
  production.session.handleMessage({
    ...request,
    type: "run",
    sceneId: "custom",
    requestId: 1,
  });
  await settle();
  expect(production.runScene).not.toHaveBeenCalled();
  expect(production.catalog.mock.lastCall?.[0].catalog.scenes).toEqual([]);
  production.session.dispose();
});
