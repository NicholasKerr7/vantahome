import { corsHeaders } from "../_shared/cors.ts";
import { getVoiceUserId } from "../_shared/voiceHandlers.ts";
import {
  fetchVoiceData,
  enqueueDeviceCommand,
} from "../_shared/voiceData.ts";
import {
  alexaDisplayCategory,
  buildAlexaCapabilities,
  buildAlexaProperties,
  getTraits,
} from "../_shared/voiceMappings.ts";
import { randomToken } from "../_shared/voiceAuth.ts";
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

function errorResponse(type: string, message: string, directive: any) {
  return {
    event: {
      header: {
        namespace: "Alexa",
        name: "ErrorResponse",
        messageId: randomToken(8),
        correlationToken: directive?.header?.correlationToken,
        payloadVersion: "3",
      },
      endpoint: directive?.endpoint,
      payload: { type, message },
    },
  };
}

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
  const securityContext = createEdgeRequestContext(req, "alexa-smart-home");
  const ipRateLimit = await enforceEdgeRateLimit(securityContext, {
    maxRequests: 600,
    windowSeconds: 60,
    requireClientIp: true,
  });
  if (!ipRateLimit.allowed) {
    return rateLimitResponse(securityContext, ipRateLimit);
  }

  const userId = await getVoiceUserId(req, "alexa");
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
    const directive = body.directive;
    if (!isPlainObject(directive) || !isPlainObject(directive.header)) {
      throw new RequestValidationError("Invalid Alexa directive.");
    }
    const header = directive.header;
    const namespace = boundedString(header.namespace, "namespace", 80);
    const name = boundedString(header.name, "name", 80);

    if (namespace === "Alexa.Discovery" && name === "Discover") {
      const { devices, rooms } = await fetchVoiceData(userId);
      const endpoints = devices.map((device) => {
        const roomName = device.room_id ? rooms.get(device.room_id) : undefined;
        return {
          endpointId: device.id,
          manufacturerName: "VantaHome",
          friendlyName: roomName ? `${roomName} ${device.name}` : device.name,
          description: `${device.kind} device`,
          displayCategories: [alexaDisplayCategory(device.kind)],
          cookie: { kind: device.kind },
          capabilities: buildAlexaCapabilities(device.kind),
        };
      });

      const payload = { endpoints };
      const response = {
        event: {
          header: {
            namespace: "Alexa.Discovery",
            name: "Discover.Response",
            messageId: randomToken(8),
            payloadVersion: "3",
          },
          payload,
        },
      };

      return finalizeEdgeResponse(
        securityContext,
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }),
        "discovery_completed",
        rateLimit,
      );
    }

    const endpoint = directive.endpoint;
    const deviceId = isPlainObject(endpoint) ? endpoint.endpointId : "";
    if (!isUuid(deviceId)) {
      return new Response(
        JSON.stringify(
          errorResponse("NO_ENDPOINT", "Missing device.", directive),
        ),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { devices, states } = await fetchVoiceData(userId);
    const device = devices.find((d) => d.id === deviceId);
    if (!device) {
      return new Response(
        JSON.stringify(
          errorResponse("NO_ENDPOINT", "Unknown device.", directive),
        ),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const patch: Record<string, unknown> = {};
    const traits = getTraits(device.kind);

    if (namespace === "Alexa.PowerController" && traits.supportsOnOff) {
      if (name === "TurnOn") patch.isOn = true;
      if (name === "TurnOff") patch.isOn = false;
    }

    if (
      namespace === "Alexa.BrightnessController" &&
      name === "SetBrightness" &&
      traits.supportsBrightness
    ) {
      const brightness = isPlainObject(directive.payload)
        ? directive.payload.brightness
        : undefined;
      if (typeof brightness === "number" && Number.isFinite(brightness)) {
        patch.brightness = Math.max(0, Math.min(100, brightness));
        patch.isOn = brightness > 0;
      }
    }

    if (
      namespace === "Alexa.ThermostatController" &&
      name === "SetTargetTemperature" &&
      traits.supportsTemp
    ) {
      const targetSetpoint = isPlainObject(directive.payload)
        && isPlainObject(directive.payload.targetSetpoint)
        ? directive.payload.targetSetpoint
        : null;
      const target = targetSetpoint?.value;
      if (typeof target === "number" && Number.isFinite(target)) {
        patch.tempC = Math.max(10, Math.min(35, target));
      }
    }

    if (
      !Object.keys(patch).length &&
      !(namespace === "Alexa" && name === "ReportState")
    ) {
      return new Response(
        JSON.stringify(
          errorResponse(
            "INVALID_DIRECTIVE",
            "Unsupported directive.",
            directive,
          ),
        ),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (Object.keys(patch).length) {
      await enqueueDeviceCommand(userId, deviceId, "alexa", patch);
    }

    // Voice requests enqueue intent; only bridge observations update device
    // state. Returning the last observed state avoids false physical claims.
    const observedState = states.get(deviceId) ?? {};

    const response = {
      context: {
        properties: buildAlexaProperties(device.kind, observedState),
      },
      event: {
        header: {
          namespace: "Alexa",
          name: "Response",
          messageId: randomToken(8),
          correlationToken: header?.correlationToken,
          payloadVersion: "3",
        },
        endpoint,
        payload: {},
      },
    };

    return finalizeEdgeResponse(
      securityContext,
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
      "fulfilled",
      rateLimit,
    );
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
