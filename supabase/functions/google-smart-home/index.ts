import { corsHeaders } from "../_shared/cors.ts";
import { getVoiceUserId } from "../_shared/voiceHandlers.ts";
import {
  fetchVoiceData,
  upsertDeviceState,
  enqueueDeviceCommand,
} from "../_shared/voiceData.ts";
import {
  googleDeviceType,
  googleTraits,
  googleState,
} from "../_shared/voiceMappings.ts";

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

  const userId = await getVoiceUserId(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const requestId = body?.requestId ?? "";
    const input = body?.inputs?.[0];
    const intent = input?.intent ?? "";

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

      return new Response(
        JSON.stringify({
          requestId,
          payload: { agentUserId: userId, devices: payloadDevices },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (intent === "action.devices.QUERY") {
      const queryDevices = input?.payload?.devices ?? [];
      const response: Record<string, unknown> = {};

      queryDevices.forEach((d: { id: string }) => {
        const device = devices.find((item) => item.id === d.id);
        if (!device) return;
        const state = states.get(d.id) ?? {};
        response[d.id] = googleState(device.kind, state);
      });

      return new Response(
        JSON.stringify({ requestId, payload: { devices: response } }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (intent === "action.devices.EXECUTE") {
      const commands = input?.payload?.commands ?? [];
      const results: Array<Record<string, unknown>> = [];

      for (const cmd of commands) {
        const execs = cmd.execution ?? [];
        const deviceIds = (cmd.devices ?? []).map((d: { id: string }) => d.id);

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

          execs.forEach((exec: any) => {
            if (exec.command === "action.devices.commands.OnOff") {
              patch.isOn = Boolean(exec.params?.on);
            }
            if (exec.command === "action.devices.commands.BrightnessAbsolute") {
              const val = Number(exec.params?.brightness ?? 0);
              patch.brightness = Math.max(0, Math.min(100, val));
              patch.isOn = val > 0;
            }
            if (
              exec.command ===
              "action.devices.commands.ThermostatTemperatureSetpoint"
            ) {
              const val = Number(
                exec.params?.thermostatTemperatureSetpoint ?? 22,
              );
              patch.tempC = val;
            }
          });

          const merged = Object.keys(patch).length
            ? await upsertDeviceState(deviceId, patch)
            : (states.get(deviceId) ?? {});

          if (Object.keys(patch).length) {
            await enqueueDeviceCommand(deviceId, {
              source: "google",
              patch,
              execs,
            });
          }

          results.push({
            ids: [deviceId],
            status: "SUCCESS",
            states: googleState(device.kind, merged),
          });
        }
      }

      return new Response(
        JSON.stringify({ requestId, payload: { commands: results } }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ error: "Unsupported intent" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
