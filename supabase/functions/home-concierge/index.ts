import { isComfortKind } from "../../../shared/home-concierge/contract.ts";
import { createConciergeHandler, type ConciergeHome } from "../_shared/conciergeHandler.ts";
import { generateConciergeResponse } from "../_shared/conciergeProvider.ts";
import { createEdgeRequestContext, enforceEdgeRateLimit, finalizeEdgeResponse } from "../_shared/edgeSecurity.ts";
import { getSupabaseClient } from "../_shared/supabaseClient.ts";
import { isPlainObject, isUuid } from "../_shared/validation.ts";

/** Authenticate using the incoming user token; a caller-provided user ID is never accepted. */
async function authenticate(request: Request): Promise<string | null> {
  const { data, error } = await getSupabaseClient(request).auth.getUser();
  return !error && isUuid(data?.user?.id) ? data.user.id : null;
}

/** Read bounded labels as data, without bringing profile, location, telemetry or security metadata into the model context. */
function safeLabel(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim()
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80) : fallback;
}

/** Use caller RLS and current SQL permissions for one home; service-role data access is intentionally absent. */
async function readHome(request: Request, userId: string, homeId: string): Promise<ConciergeHome | null> {
  const client = getSupabaseClient(request);
  const access = await client.rpc("can_access_home", { hid: homeId });
  if (access.error) throw new Error("Home access unavailable");
  if (access.data !== true) return null;
  const [registry, rooms, permissions] = await Promise.all([
    client.from("devices").select("id, name, kind, room_id, simulation_only")
      .eq("home_id", homeId).eq("simulation_only", true)
      .in("kind", ["light", "ac", "fan", "blinds", "tv", "speaker"]).limit(129),
    client.from("rooms").select("id, name").eq("home_id", homeId).limit(129),
    Promise.all(["device.view", "light.control", "climate.control", "device.control", "automation.manage"].map(async (permission) => {
      const result = await client.rpc("effective_member_has_action_permission", {
        target_home_id: homeId, target_user_id: userId, requested_permission: permission,
      });
      if (result.error || typeof result.data !== "boolean") throw new Error("Permissions unavailable");
      return [permission, result.data] as const;
    })),
  ]);
  if (registry.error || rooms.error || !Array.isArray(registry.data) || !Array.isArray(rooms.data)
    || registry.data.length > 128 || rooms.data.length > 128) throw new Error("Home context unavailable");
  const allowed = new Map(permissions);
  if (!allowed.get("device.view")) return { devices: [], canDraft: false };
  const roomNames = new Map<string, string>();
  for (const room of rooms.data as unknown[]) {
    if (isPlainObject(room) && isUuid(room.id)) roomNames.set(room.id, safeLabel(room.name, "Room"));
  }
  const devices: ConciergeHome["devices"] = [];
  for (const device of registry.data as unknown[]) {
    if (!isPlainObject(device) || !isUuid(device.id) || !isComfortKind(device.kind)
      || device.simulation_only !== true || typeof device.room_id !== "string" || !roomNames.has(device.room_id)) continue;
    const permission = device.kind === "light" ? "light.control" : device.kind === "ac" ? "climate.control" : "device.control";
    devices.push({ id: device.id, kind: device.kind, name: safeLabel(device.name, "Device"),
      roomName: roomNames.get(device.room_id)!, controllable: allowed.get(permission) === true });
  }
  return { devices, canDraft: allowed.get("automation.manage") === true };
}

Deno.serve(createConciergeHandler({
  authenticate,
  readHome,
  configured: () => Boolean(Deno.env.get("OPENAI_API_KEY")?.trim()),
  generate: (request, signal) => generateConciergeResponse(request, {
    apiKey: Deno.env.get("OPENAI_API_KEY") ?? "",
    model: Deno.env.get("HOME_CONCIERGE_MODEL")?.trim() || "gpt-6.1-sol",
    signal,
  }),
  createContext: (request) => createEdgeRequestContext(request, "home-concierge"),
  limit: enforceEdgeRateLimit,
  finalize: finalizeEdgeResponse,
}));
