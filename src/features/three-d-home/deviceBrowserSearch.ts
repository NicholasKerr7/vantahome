import {
  getRoom,
  type DeviceDefinition,
} from "../../../packages/home-scene/src/data";

/** Match every search term across a device's name, kind, and exact house-plan room. */
export function deviceMatchesQuery(
  device: DeviceDefinition,
  query: string,
): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text =
    `${device.name} ${device.kind.replace(/-/g, " ")} ${getRoom(device.roomId).name}`.toLocaleLowerCase();
  return terms.every((term) => text.includes(term));
}
