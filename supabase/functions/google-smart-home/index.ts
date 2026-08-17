import { corsHeaders } from "../_shared/cors.ts";
import { getVoiceUserId } from "../_shared/voiceHandlers.ts";
import {
  fetchVoiceData,
  enqueueDeviceCommand,
} from "../_shared/voiceData.ts";
import {
  googleDeviceType,
  googleTraits,
  googleState,
  getTraits,
} from "../_shared/voiceMappings.ts";
import {
  boundedString,
  isPlainObject,
  isUuid,
  readJsonObject,
  RequestValidationError,
} from "../_shared/validation.ts";
import {
  createEdgeRequestContext,
  enforceEdgeRateLimit,
  finalizeEdgeResponse,
  rateLimitResponse,
} from "../_shared/edgeSecurity.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const securityContext = createEdgeRequestContext(req, "google-smart-home");
  const ipRateLimit = await enforceEdgeRateLimit(securityContext, {
    maxRequests: 600,
    windowSeconds: 60,
    requireClientIp: true,
  });
  if (!ipRateLimit.allowed) {
    return rateLimitResponse(securityContext, ipRateLimit);
  }

  const userId = await getVoiceUserId(req, "google");
  if (!userId) {
    return finalizeEdgeResponse(
      securityContext,
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
      "unauthorized",
    );
  }
  const rateLimit = await enforceEdgeRateLimit(securityContext, {
    actorId: userId,
    maxRequests: 600,
    windowSeconds: 60,
    includeClientIp: false,
  });
  if (!rateLimit.allowed) return rateLimitResponse(securityContext, rateLimit);

  try {
    const body = await readJsonObject(req, 32_768);
    const requestId = boundedString(body.requestId, "requestId", 128);
    if (!Array.isArray(body.inputs) || body.inputs.length !== 1) {
      throw new RequestValidationError("Exactly one Google input is required.");
    }
    const input = body.inputs[0];
    if (!isPlainObject(input)) {
      throw new RequestValidationError("Invalid Google input.");
    }
    const intent = boundedString(input.intent, "intent", 80);

    const { devices, rooms, states } = await fetchVoiceData(userId);

    if (intent === "action.devices.SYNC") {
      const payloadDevices = devices.map((device) => {
        const roomName = device.room_id ? rooms.get(device.room_id) : undefined;
        return {
          id: device.id,
          type: googleDeviceType(device.kind),
          traits: googleTraits(device.kind),
          name: { name: device.name },
          roomHint: roomName,
          deviceInfo: { manufacturer: "VantaHome", model: device.kind },
          willReportState: false,
        };
      });

      return finalizeEdgeResponse(
        securityContext,
        new Response(JSON.stringify({
          requestId,
          payload: { agentUserId: userId, devices: payloadDevices },
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }),
        "sync_completed",
        rateLimit,
      );
    }

    if (intent === "action.devices.QUERY") {
      const payload = isPlainObject(input.payload) ? input.payload : null;
      const queryDevices = payload?.devices;
      if (!Array.isArray(queryDevices) || queryDevices.length > 64) {
        throw new RequestValidationError("Invalid query device list.");
      }
      const response: Record<string, unknown> = {};

      queryDevices.forEach((entry) => {
        if (!isPlainObject(entry) || !isUuid(entry.id)) return;
        const device = devices.find((item) => item.id === entry.id);
        if (!device) return;
        const state = states.get(entry.id) ?? {};
        response[entry.id] = googleState(device.kind, state);
      });

      return finalizeEdgeResponse(
        securityContext,
        new Response(JSON.stringify({ requestId, payload: { devices: response } }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }),
        "query_completed",
        rateLimit,
      );
    }

    if (intent === "action.devices.EXECUTE") {
      const payload = isPlainObject(input.payload) ? input.payload : null;
      const commands = payload?.commands;
      if (!Array.isArray(commands) || commands.length > 64) {
        throw new RequestValidationError("Invalid command list.");
      }
      const results: Array<Record<string, unknown>> = [];

      for (const cmd of commands) {
        if (!isPlainObject(cmd)) {
          throw new RequestValidationError("Invalid command.");
        }
        const execs = cmd.execution;
        const commandDevices = cmd.devices;
        if (
          !Array.isArray(execs) ||
          execs.length > 16 ||
          !Array.isArray(commandDevices) ||
          commandDevices.length > 64
        ) {
          throw new RequestValidationError("Invalid command shape.");
        }
        const deviceIds = commandDevices.flatMap((entry) =>
          isPlainObject(entry) && isUuid(entry.id) ? [entry.id] : []
        );

        for (const deviceId of deviceIds) {
          const device = devices.find((d) => d.id === deviceId);
          if (!device) {
            results.push({
              ids: [deviceId],
              status: "ERROR",
              errorCode: "deviceNotFound",
            });
            continue;
          }

          let patch: Record<string, unknown> = {};
          const traits = getTraits(device.kind);

          execs.forEach((execution) => {
            if (!isPlainObject(execution)) return;
            const params = isPlainObject(execution.params)
              ? execution.params
              : {};
            if (
              execution.command === "action.devices.commands.OnOff" &&
              traits.supportsOnOff &&
              typeof params.on === "boolean"
            ) {
              patch.isOn = params.on;
            }
            if (
              execution.command ===
                "action.devices.commands.BrightnessAbsolute" &&
              traits.supportsBrightness &&
              typeof params.brightness === "number" &&
              Number.isFinite(params.brightness)
            ) {
              const val = params.brightness;
              patch.brightness = Math.max(0, Math.min(100, val));
              patch.isOn = val > 0;
            }
            if (
              execution.command ===
                "action.devices.commands.ThermostatTemperatureSetpoint" &&
              traits.supportsTemp &&
              typeof params.thermostatTemperatureSetpoint === "number" &&
              Number.isFinite(params.thermostatTemperatureSetpoint)
            ) {
              patch.tempC = Math.max(
                10,
                Math.min(35, params.thermostatTemperatureSetpoint),
              );
            }
          });

          if (!Object.keys(patch).length) {
            results.push({
              ids: [deviceId],
              status: "ERROR",
              errorCode: "functionNotSupported",
            });
            continue;
          }
          await enqueueDeviceCommand(userId, deviceId, "google", patch);

          results.push({
            ids: [deviceId],
            status: "SUCCESS",
            // State remains bridge-observed; the voice request only queues intent.
            states: googleState(device.kind, states.get(deviceId) ?? {}),
          });
        }
      }

      return finalizeEdgeResponse(
        securityContext,
        new Response(JSON.stringify({ requestId, payload: { commands: results } }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }),
        "execution_completed",
        rateLimit,
      );
    }

    return new Response(JSON.stringify({ error: "Unsupported intent" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const status = err instanceof RequestValidationError ? 400 : 500;
    return finalizeEdgeResponse(
      securityContext,
      new Response(JSON.stringify({ error: (err as Error).message }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
      status === 400 ? "invalid_request" : "server_error",
      rateLimit,
    );
  }
});
