import { corsHeaders } from '../_shared/cors.ts';
import { getVoiceUserId } from '../_shared/voiceHandlers.ts';
import { fetchVoiceData, upsertDeviceState, enqueueDeviceCommand } from '../_shared/voiceData.ts';
import { alexaDisplayCategory, buildAlexaCapabilities, buildAlexaProperties } from '../_shared/voiceMappings.ts';
import { randomToken } from '../_shared/voiceAuth.ts';

function errorResponse(type: string, message: string, directive: any) {
  return {
    event: {
      header: {
        namespace: 'Alexa',
        name: 'ErrorResponse',
        messageId: randomToken(8),
        correlationToken: directive?.header?.correlationToken,
        payloadVersion: '3',
      },
      endpoint: directive?.endpoint,
      payload: { type, message },
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userId = await getVoiceUserId(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const directive = body?.directive;
    const header = directive?.header;
    const namespace = header?.namespace;
    const name = header?.name;

    if (namespace === 'Alexa.Discovery' && name === 'Discover') {
      const { devices, rooms } = await fetchVoiceData(userId);
      const endpoints = devices.map((device) => {
        const roomName = device.room_id ? rooms.get(device.room_id) : undefined;
        return {
          endpointId: device.id,
          manufacturerName: 'VantaHome',
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
            namespace: 'Alexa.Discovery',
            name: 'Discover.Response',
            messageId: randomToken(8),
            payloadVersion: '3',
          },
          payload,
        },
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const endpoint = directive?.endpoint;
    const deviceId = endpoint?.endpointId;
    if (!deviceId) {
      return new Response(JSON.stringify(errorResponse('NO_ENDPOINT', 'Missing device.', directive)), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { devices, states } = await fetchVoiceData(userId);
    const device = devices.find((d) => d.id === deviceId);
    if (!device) {
      return new Response(JSON.stringify(errorResponse('NO_ENDPOINT', 'Unknown device.', directive)), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const patch: Record<string, unknown> = {};

    if (namespace === 'Alexa.PowerController') {
      if (name === 'TurnOn') patch.isOn = true;
      if (name === 'TurnOff') patch.isOn = false;
    }

    if (namespace === 'Alexa.BrightnessController' && name === 'SetBrightness') {
      const brightness = directive?.payload?.brightness;
      if (typeof brightness === 'number') {
        patch.brightness = Math.max(0, Math.min(100, brightness));
        patch.isOn = brightness > 0;
      }
    }

    if (namespace === 'Alexa.ThermostatController' && name === 'SetTargetTemperature') {
      const target = directive?.payload?.targetSetpoint?.value;
      if (typeof target === 'number') patch.tempC = target;
    }

    if (!Object.keys(patch).length && !(namespace === 'Alexa' && name === 'ReportState')) {
      return new Response(JSON.stringify(errorResponse('INVALID_DIRECTIVE', 'Unsupported directive.', directive)), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mergedState = Object.keys(patch).length
      ? await upsertDeviceState(deviceId, patch)
      : (states.get(deviceId) ?? {});

    if (Object.keys(patch).length) {
      await enqueueDeviceCommand(deviceId, {
        source: 'alexa',
        namespace,
        name,
        patch,
      });
    }

    const response = {
      context: {
        properties: buildAlexaProperties(device.kind, mergedState),
      },
      event: {
        header: {
          namespace: 'Alexa',
          name: 'Response',
          messageId: randomToken(8),
          correlationToken: header?.correlationToken,
          payloadVersion: '3',
        },
        endpoint,
        payload: {},
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
