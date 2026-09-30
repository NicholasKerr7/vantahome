export const SCENE_CATALOG_CHANNEL = "vantahome-scene-catalog";
// Covers the maximum item count even when every allowed character requires JSON escaping.
export const MAX_SCENE_CATALOG_BYTES = 256 * 1024;
export const MAX_SCENE_CATALOG_ITEMS = 256;

/** Only public scene labels and counts cross the boundary; device actions remain in the host. */
export type SceneSummary = {
  id: string;
  name: string;
  scope: string;
  deviceCount: number;
};
export type SceneCatalog = {
  scenes: SceneSummary[];
  activeSceneId: string | null;
};
export type SceneCatalogRequest = {
  channel: typeof SCENE_CATALOG_CHANNEL;
  version: 1;
} & ({ type: "request" } | { type: "run"; sceneId: string; requestId: number });
export type SceneCatalogMessage = {
  channel: typeof SCENE_CATALOG_CHANNEL;
  version: 1;
  type: "catalog";
  catalog: SceneCatalog;
};

/** Bound every envelope before examining untrusted web or native bridge data. */
function envelope(input: unknown): Record<string, unknown> | null {
  try {
    const serialized =
      typeof input === "string" ? input : JSON.stringify(input);
    if (!serialized || serialized.length > MAX_SCENE_CATALOG_BYTES) return null;
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const record = value as Record<string, unknown>;
    return record.channel === SCENE_CATALOG_CHANNEL && record.version === 1
      ? record
      : null;
  } catch {
    return null;
  }
}

/** Exact keys prevent future command-like fields from acquiring accidental meaning. */
function keys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  return (
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

/** IDs and labels are plain bounded strings, never executable content or capability definitions. */
function text(value: unknown, limit: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= limit &&
    !/[\u0000-\u001f]/u.test(value)
  );
}

/** Run requests contain only a scene identity and monotonic request number. */
export function parseSceneCatalogRequest(
  input: unknown,
): SceneCatalogRequest | null {
  const value = envelope(input);
  if (!value) return null;
  if (value.type === "request" && keys(value, ["channel", "version", "type"]))
    return { channel: SCENE_CATALOG_CHANNEL, version: 1, type: "request" };
  if (
    value.type !== "run" ||
    !keys(value, ["channel", "version", "type", "sceneId", "requestId"]) ||
    !text(value.sceneId, 160) ||
    typeof value.requestId !== "number" ||
    !Number.isSafeInteger(value.requestId) ||
    value.requestId < 1
  )
    return null;
  return {
    channel: SCENE_CATALOG_CHANNEL,
    version: 1,
    type: "run",
    sceneId: value.sceneId,
    requestId: value.requestId,
  };
}

/** Reject malformed or duplicate scene summaries rather than accepting a partial catalog. */
export function parseSceneCatalogMessage(
  input: unknown,
): SceneCatalogMessage | null {
  const value = envelope(input);
  if (
    !value ||
    value.type !== "catalog" ||
    !keys(value, ["channel", "version", "type", "catalog"]) ||
    !value.catalog ||
    typeof value.catalog !== "object" ||
    Array.isArray(value.catalog)
  )
    return null;
  const catalog = value.catalog as Record<string, unknown>;
  if (
    !keys(catalog, ["scenes", "activeSceneId"]) ||
    !Array.isArray(catalog.scenes) ||
    catalog.scenes.length > MAX_SCENE_CATALOG_ITEMS
  )
    return null;
  const ids = new Set<string>();
  const scenes: SceneSummary[] = [];
  for (const item of catalog.scenes) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const scene = item as Record<string, unknown>;
    if (
      !keys(scene, ["id", "name", "scope", "deviceCount"]) ||
      !text(scene.id, 160) ||
      !text(scene.name, 120) ||
      !text(scene.scope, 120) ||
      typeof scene.deviceCount !== "number" ||
      !Number.isSafeInteger(scene.deviceCount) ||
      scene.deviceCount < 0 ||
      scene.deviceCount > 1024 ||
      ids.has(scene.id)
    )
      return null;
    ids.add(scene.id);
    scenes.push({
      id: scene.id,
      name: scene.name,
      scope: scene.scope,
      deviceCount: scene.deviceCount,
    });
  }
  if (
    catalog.activeSceneId !== null &&
    (typeof catalog.activeSceneId !== "string" ||
      !ids.has(catalog.activeSceneId))
  )
    return null;
  return {
    channel: SCENE_CATALOG_CHANNEL,
    version: 1,
    type: "catalog",
    catalog: { scenes, activeSceneId: catalog.activeSceneId as string | null },
  };
}
