import { useEffect, useRef, useState } from "react";
import { isEmbeddedScene } from "./embeddedHost";
import { MODEL_SCENE_PRESETS } from "./modelScenePresets";
import {
  parseSceneCatalogMessage,
  SCENE_CATALOG_CHANNEL,
  type SceneCatalog,
} from "./sceneCatalogProtocol";
import { connectSceneCatalogTransport } from "./sceneCatalogTransport";
import { useHomeStore } from "./state";

const emptyCatalog: SceneCatalog = { scenes: [], activeSceneId: null };
let nextSceneRequest = 0;

/** Share the host's saved scenes in the app, while the independent authoring preview keeps its defaults. */
export function useSceneCatalog() {
  const embedded = isEmbeddedScene();
  const activePreset = useHomeStore((state) => state.activePreset);
  const activatePreset = useHomeStore((state) => state.activatePreset);
  const [catalog, setCatalog] = useState<SceneCatalog>(emptyCatalog);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const transport = useRef<ReturnType<
    typeof connectSceneCatalogTransport
  > | null>(null);
  useEffect(() => {
    if (!embedded) return;
    let received = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    setStatus("loading");
    setCatalog(emptyCatalog);
    const connection = connectSceneCatalogTransport(window, (input) => {
      const message = parseSceneCatalogMessage(input);
      if (!message) return;
      received = true;
      for (const timer of timers) clearTimeout(timer);
      setCatalog(message.catalog);
      setStatus("ready");
    });
    transport.current = connection;
    /** Retry only the bounded initial handshake; scene execution is never automatically replayed. */
    function request() {
      if (received) return;
      try {
        connection.send({
          channel: SCENE_CATALOG_CHANNEL,
          version: 1,
          type: "request",
        });
      } catch {
        setStatus("error");
      }
    }
    request();
    for (const delay of [2000, 5000]) timers.push(setTimeout(request, delay));
    timers.push(
      setTimeout(() => {
        if (!received) setStatus("error");
      }, 12000),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
      connection.dispose();
      transport.current = null;
    };
  }, [embedded, attempt]);

  /** Resolve a still-visible identity instead of shipping device actions from the rendering document. */
  function runScene(id: string) {
    if (!embedded) {
      const preset = MODEL_SCENE_PRESETS.find(
        (candidate) => candidate.sceneId === id,
      );
      if (preset) activatePreset(preset.id);
      return;
    }
    if (status !== "ready" || !catalog.scenes.some((scene) => scene.id === id))
      return;
    try {
      transport.current?.send({
        channel: SCENE_CATALOG_CHANNEL,
        version: 1,
        type: "run",
        sceneId: id,
        requestId: ++nextSceneRequest,
      });
    } catch {
      setCatalog(emptyCatalog);
      setStatus("error");
    }
  }

  return {
    catalog: embedded
      ? catalog
      : {
          scenes: MODEL_SCENE_PRESETS.map((preset) => ({
            id: preset.sceneId,
            name: preset.name,
            scope: "Whole home",
            deviceCount: 0,
          })),
          activeSceneId:
            MODEL_SCENE_PRESETS.find((preset) => preset.id === activePreset)
              ?.sceneId ?? null,
        },
    status: embedded ? status : ("ready" as const),
    runScene,
    retry: () => setAttempt((value) => value + 1),
  };
}
