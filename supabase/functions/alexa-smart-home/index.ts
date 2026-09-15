import { corsHeaders } from "../_shared/cors.ts";
import { getVoiceTokenAuthentication } from "../_shared/voiceHandlers.ts";
import {
  fetchVoiceData,
  enqueueDeviceCommand,
} from "../_shared/voiceData.ts";
import {
  alexaDisplayCategory,
  buildAlexaCapabilities,
  getTraits,
} from "../_shared/voiceMappings.ts";
import { buildAlexaObservedProperties } from "../_shared/alexaState.ts";
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
  type RateLimitResult,
} from "../_shared/edgeSecurity.ts";

type AlexaDirective = {
  header: {
    namespace: string;
    name: string;
    correlationToken?: string;
  };
  endpoint?: Record<string, unknown>;
  payload: Record<string, unknown>;
};

function parseDirective(body: Record<string, unknown>): AlexaDirective {
  const directive = body.directive;
  if (
    !isPlainObject(directive) || !isPlainObject(directive.header) ||
    !isPlainObject(directive.payload) ||
    (directive.endpoint !== undefined && !isPlainObject(directive.endpoint))
  ) {
    throw new RequestValidationError("Invalid Alexa directive.");
  }
  const header = directive.header;
  const namespace = boundedString(header.namespace, "namespace", 80);
  const name = boundedString(header.name, "name", 80);
  const versions = namespace === "Alexa.ThermostatController" ? ["3", "3.1", "3.2"] : ["3"];
  if (
    (header.payloadVersion !== undefined && (
      typeof header.payloadVersion !== "string" || !versions.includes(header.payloadVersion)
    )) ||
    (header.messageId !== undefined && (
      typeof header.messageId !== "string" ||
      !/^[A-Za-z0-9-]{1,128}$/.test(header.messageId)
    )) ||
    (header.correlationToken !== undefined && (
      typeof header.correlationToken !== "string" ||
      header.correlationToken.length === 0 ||
      header.correlationToken.length > 8192
    ))
  ) {
    throw new RequestValidationError("Invalid Alexa header.");
  }
  return {
    header: {
      namespace,
      name,
      // Correlation tokens are opaque and must not be trimmed or normalized.
      ...(typeof header.correlationToken === "string"
        ? { correlationToken: header.correlationToken }
        : {}),
    },
    endpoint: directive.endpoint as Record<string, unknown> | undefined,
    payload: directive.payload,
  };
}

function directiveToken(req: Request, directive: AlexaDirective): string | null {
  const isDiscovery = directive.header.namespace === "Alexa.Discovery" &&
    directive.header.name === "Discover";
  const container = isDiscovery ? directive.payload : directive.endpoint;
  const wrongContainer = isDiscovery ? directive.endpoint : directive.payload;
  const ownsScope = (value: Record<string, unknown> | undefined) =>
    value !== undefined && Object.prototype.hasOwnProperty.call(value, "scope");
  if (ownsScope(wrongContainer)) return null;

  const authorization = req.headers.get("authorization");
  const headerToken = authorization?.match(/^Bearer ([0-9a-f]{48})$/i)?.[1];
  if (authorization !== null && !headerToken) return null;

  if (!ownsScope(container)) return headerToken ?? null;
  const scope = container?.scope;
  if (
    !isPlainObject(scope) || scope.type !== "BearerToken" ||
    typeof scope.token !== "string" || !/^[0-9a-f]{48}$/i.test(scope.token)
  ) return null;
  // Keep header-only callers compatible, but never let a header override a
  // malformed native scope or authenticate a different linked account.
  if (headerToken !== undefined && headerToken !== scope.token) return null;
  return scope.token;
}

function responseEndpoint(directive?: AlexaDirective) {
  const endpointId = directive?.endpoint?.endpointId;
  return isUuid(endpointId) ? { endpointId } : undefined;
}

function errorResponse(
  type: string,
  message: string,
  directive?: AlexaDirective,
  details: Record<string, unknown> = {},
) {
  return {
    event: {
      header: {
        namespace: "Alexa",
        name: "ErrorResponse",
        messageId: randomToken(8),
        correlationToken: directive?.header?.correlationToken,
        payloadVersion: "3",
      },
      endpoint: responseEndpoint(directive),
      payload: { ...details, type, message },
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

  let directive: AlexaDirective | undefined;
  let rateLimit: RateLimitResult | undefined;
  const respond = (payload: Record<string, unknown>, status: number, outcome: string) =>
    finalizeEdgeResponse(
      securityContext,
      new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
      outcome,
      rateLimit,
    );
  try {
    const body = await readJsonObject(req, 32_768);
    directive = parseDirective(body);
    const authentication = await getVoiceTokenAuthentication(
      directiveToken(req, directive), "alexa", {
        distinguishExpired: true,
        // Lookup outages must not tell Alexa to unlink a valid account.
        throwOnStorageError: true,
      },
    );
    if (!authentication.identity) {
      return respond(errorResponse(
        authentication.error,
        authentication.error === "EXPIRED_AUTHORIZATION_CREDENTIAL"
          ? "The account authorization has expired."
          : "The account authorization is invalid.",
        directive,
      ), 401, "unauthorized");
    }
    const userId = authentication.identity.userId;
    rateLimit = await enforceEdgeRateLimit(securityContext, {
      actorId: userId,
      maxRequests: 600,
      windowSeconds: 60,
      includeClientIp: false,
    });
    if (!rateLimit.allowed) return rateLimitResponse(securityContext, rateLimit);
    const header = directive.header;
    const { namespace, name } = header;

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

      return respond(response, 200, "discovery_completed");
    }

    const endpoint = directive.endpoint;
    const deviceId = isPlainObject(endpoint) ? endpoint.endpointId : "";
    if (!isUuid(deviceId)) {
      return respond(errorResponse("NO_SUCH_ENDPOINT", "Missing device.", directive), 400, "invalid_endpoint");
    }

    const { devices, states } = await fetchVoiceData(userId);
    const device = devices.find((d) => d.id === deviceId);
    if (!device) {
      return respond(errorResponse("NO_SUCH_ENDPOINT", "Unknown device.", directive), 404, "unknown_endpoint");
    }

    if (namespace === "Alexa" && name === "ReportState") {
      const properties = buildAlexaObservedProperties(device.kind, states.get(deviceId) ?? {});
      if (!properties) {
        return respond(errorResponse(
          "INTERNAL_ERROR",
          "A complete device observation is unavailable.",
          directive,
        ), 500, "observation_unavailable");
      }
      return respond({
        context: { properties },
        event: {
          header: {
            namespace: "Alexa",
            name: "StateReport",
            messageId: randomToken(8),
            correlationToken: header.correlationToken,
            payloadVersion: "3",
          },
          endpoint: responseEndpoint(directive),
          payload: {},
        },
      }, 200, "state_reported");
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
      const brightness = directive.payload.brightness;
      if (
        typeof brightness !== "number" || !Number.isInteger(brightness) ||
        brightness < 0 || brightness > 100
      ) {
        return respond(errorResponse(
          "INVALID_VALUE", "Brightness must be an integer from 0 to 100.", directive,
        ), 400, "invalid_value");
      }
      patch.brightness = brightness;
      patch.isOn = brightness > 0;
    }

    if (
      namespace === "Alexa.ThermostatController" &&
      name === "SetTargetTemperature" &&
      traits.supportsTemp
    ) {
      const targetSetpoint = isPlainObject(directive.payload.targetSetpoint)
        ? directive.payload.targetSetpoint
        : null;
      const target = targetSetpoint?.value;
      const scale = targetSetpoint?.scale;
      if (
        typeof target !== "number" || !Number.isFinite(target) ||
        (scale !== "CELSIUS" && scale !== "FAHRENHEIT" && scale !== "KELVIN")
      ) {
        return respond(errorResponse(
          "INVALID_VALUE", "A valid temperature and temperature scale are required.", directive,
        ), 400, "invalid_value");
      }
      // Device commands use Celsius. Convert the requested unit before bounds
      // validation; clamping a Fahrenheit value would change the user's intent.
      const temperatureC = scale === "FAHRENHEIT"
        ? (target - 32) * 5 / 9
        : scale === "KELVIN" ? target - 273.15 : target;
      if (!Number.isFinite(temperatureC) || temperatureC < 10 || temperatureC > 35) {
        return respond(errorResponse(
          "TEMPERATURE_VALUE_OUT_OF_RANGE",
          "The target temperature must be between 10 and 35 degrees Celsius.",
          directive,
          {
            validRange: {
              minimumValue: { value: 10, scale: "CELSIUS" },
              maximumValue: { value: 35, scale: "CELSIUS" },
            },
          },
        ), 400, "invalid_value");
      }
      patch.tempC = temperatureC;
    }

    if (!Object.keys(patch).length) {
      return respond(errorResponse(
        "INVALID_DIRECTIVE",
        "Unsupported directive.",
        directive,
      ), 400, "invalid_directive");
    }

    await enqueueDeviceCommand(userId, deviceId, "alexa", patch);
    // Alexa.Response confirms physical completion. Queue acceptance supplies
    // no such evidence, and these controllers do not support DeferredResponse.
    return respond(errorResponse(
      "INTERNAL_ERROR",
      "Command queued; device completion could not be confirmed.",
      directive,
    ), 200, "command_completion_unconfirmed");
  } catch (err) {
    const status = err instanceof RequestValidationError ? 400 : 500;
    return respond(errorResponse(
      status === 400 ? "INVALID_DIRECTIVE" : "INTERNAL_ERROR",
      status === 400 ? "Invalid Alexa request." : "The device request could not be completed.",
      directive,
    ), status, status === 400 ? "invalid_request" : "server_error");
  }
});
