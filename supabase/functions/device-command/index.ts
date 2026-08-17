import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/supabaseClient.ts";
import {
  boundedString,
  isPlainObject,
  isSafeJson,
  isUuid,
  readJsonObject,
  RequestValidationError,
} from "../_shared/validation.ts";

const COMMAND_ACTIONS = new Set([
  "toggle",
  "set-properties",
  "set-temp",
  "set-brightness",
  "set-volume",
  "set-mode",
  "set-channel",
  "set-muted",
  "launch-app",
  "media",
  "nav",
]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = getSupabaseClient(request);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const command = await readJsonObject(request, 16_384);
    const deviceId = boundedString(command.deviceId, "deviceId", 64);
    const commandId = boundedString(command.commandId, "commandId", 128);
    const nonce = boundedString(command.nonce, "nonce", 128);
    const idempotencyKey = boundedString(
      command.idempotencyKey,
      "idempotencyKey",
      128,
    );
    const action = boundedString(command.op, "op", 64);
    const createdAt = command.createdAt;
    const expiresAt = command.expiresAt;
    const changes = command.changes;
    const attemptsImmutableMutation =
      action === "set-properties" &&
      (!isPlainObject(changes) ||
        ["id", "name", "kind", "roomId", "__proto__", "constructor", "prototype"].some(
          (key) => Object.prototype.hasOwnProperty.call(changes, key),
        ));
    if (
      !isUuid(deviceId) ||
      !COMMAND_ACTIONS.has(action) ||
      typeof createdAt !== "number" ||
      typeof expiresAt !== "number" ||
      !Number.isFinite(createdAt) ||
      !Number.isFinite(expiresAt) ||
      createdAt < Date.now() - 30_000 ||
      createdAt > Date.now() + 5_000 ||
      expiresAt <= Date.now() ||
      expiresAt > createdAt + 60_000 ||
      !isPlainObject(command) ||
      !isSafeJson(command) ||
      attemptsImmutableMutation
    ) {
      throw new RequestValidationError("Command envelope is invalid or expired.");
    }

    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("home_id")
      .eq("id", deviceId)
      .maybeSingle();
    if (deviceError || !device) {
      return new Response(JSON.stringify({ error: "Device not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("device_commands")
      .insert({
        command_id: commandId,
        home_id: device.home_id,
        device_id: deviceId,
        actor_user_id: userData.user.id,
        action,
        payload: command,
        nonce,
        idempotency_key: idempotencyKey,
        created_at: new Date(createdAt).toISOString(),
        expires_at: new Date(expiresAt).toISOString(),
      })
      .select("command_id, status, created_at, expires_at")
      .single();

    if (error) {
      const status = error.code === "23505" ? 409 : 403;
      return new Response(JSON.stringify({ error: error.message }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ command: data }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const status = error instanceof RequestValidationError ? 400 : 500;
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
