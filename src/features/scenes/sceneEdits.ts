import type { Scene } from "../../store/useHomeStore";

/** Compare saved form data without treating key order or omitted undefined fields as edits. */
export function sceneValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sceneValuesEqual(value, right[index]))
    );
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord)
    .filter((key) => leftRecord[key] !== undefined)
    .sort();
  const rightKeys = Object.keys(rightRecord)
    .filter((key) => rightRecord[key] !== undefined)
    .sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        sceneValuesEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

/** A rename or no-op save retains authored atmosphere; changing commands or scope detaches it. */
export function sceneEditChangesBehavior(
  scene: Scene,
  patch: Partial<Scene>,
): boolean {
  const next = { ...scene, ...patch };
  const scopeChanged =
    (scene.scope ?? "room") !== (next.scope ?? "room") ||
    (next.scope !== "home" && scene.roomId !== next.roomId);
  return scopeChanged || !sceneValuesEqual(scene.actions, next.actions);
}
