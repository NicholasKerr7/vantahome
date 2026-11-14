import { getDevice } from '../../../packages/home-scene/src/data';
import type { ConciergeResponse } from '../../../shared/home-concierge/contract';
import { parseHomeVoiceCommand, type HomeVoiceCommand } from '../home-voice/voiceCommandParser';
import { normalizeVoiceText } from '../home-voice/voiceCommandLanguage';
import type { AssistantContext, AssistantDevice } from './assistantContext';

export type LocalAssistantResolution =
  | { kind: 'cloud' }
  | { kind: 'reply'; response: ConciergeResponse }
  | { kind: 'command'; command: HomeVoiceCommand; description: string; deviceIds: string[] };

/** Keep all direct replies in the existing checked response contract; they never contain a scene. */
export function localVoiceReply(answer: string, deviceIds: string[] = [], title = 'From your home'): ConciergeResponse {
  return { title, answer, deviceIds, scene: null };
}

/** Bound spoken lists while retaining the exact count and current permitted names. */
function nameList(devices: AssistantDevice[]): string {
  const names = devices.slice(0, 5).map((device) => `${device.name} in ${device.roomName}`).join(', ');
  return names + (devices.length > 5 ? `, and ${devices.length - 5} more` : '');
}

/** Distinguish direct requests from advice without passing failed commands to a model that cannot run them. */
export function resolveLocalAssistantVoice(question: string, context: AssistantContext): LocalAssistantResolution {
  const text = normalizeVoiceText(question).replace(/^(?:can|could|would|will) you /, '');
  const reply = (answer: string, devices: AssistantDevice[] = []): LocalAssistantResolution => ({
    kind: 'reply', response: localVoiceReply(answer, devices.map((device) => device.id)),
  });
  if (!context.available) return reply(context.reason || 'Your home access is still being verified. Please try again.');
  if (/^(?:run|activate|start|stop|end) .*(?:scene|routine|automation)\b/.test(text)) {
    return reply('Open the saved scene or routine and review its controls. Nothing has run.');
  }
  if (/^(?:(?:do not|don['’]t|never) )?(?:turn|switch|open|close|set|dim|lock|unlock|start|stop|run|activate|deactivate)\b/.test(text)) {
    // A scene proposal remains a deliberate, separate review/create/run journey.
    if (/^(?:set|start) (?:a |an )?(?:mood|scene)\b/.test(text)) return { kind: 'cloud' };
    const definitions = context.devices.flatMap((device) => {
      const definition = getDevice(device.modelDeviceId);
      return definition ? [{ ...definition, name: device.name }] : [];
    });
    const result = parseHomeVoiceCommand(question, {
      devices: definitions, rooms: context.availableRooms.flatMap((room) => {
        const device = context.devices.find((item) => item.roomId === room.id);
        const modelRoomId = device ? getDevice(device.modelDeviceId)?.roomId : undefined;
        return modelRoomId ? [{ id: modelRoomId, name: room.name }] : [];
      }), selectedRoomId: context.roomId ? definitions[0]?.roomId : null,
    });
    if ('error' in result) return reply(`${result.error} Nothing changed. For entry, security or other equipment, use full controls.`);
    const targets = result.command.deviceIds.map((id) => context.devices.find((device) => device.modelDeviceId === id));
    if (targets.some((device) => !device?.controllable)) return reply('Those controls are not available with your current access. Nothing changed.');
    if (result.command.type === 'position' && targets.some((device) => device?.kind !== 'blinds')) {
      return reply('Use full controls to review that opening. Nothing changed.');
    }
    return { kind: 'command', command: result.command, description: result.description,
      deviceIds: targets.flatMap((device) => device ? [device.id] : []) };
  }
  if (/^(?:home brief|give me (?:a |my )?home brief|how is my home|what['’]s happening(?: here)?|what is happening(?: here)?)$/.test(text)) {
    return reply(`${context.scopeLabel}: ${context.brief.deviceCount} comfort devices across ${context.brief.roomCount} rooms. ${context.brief.lightsOnCount} lights and ${context.brief.climateOnCount} climate devices are on in the simulation.`);
  }
  if (/^(?:(?:which|what|how many) lights are on|are any lights on)(?: here| in this room| in my home)?$/.test(text)) {
    const lights = context.devices.filter((device) => device.kind === 'light' && device.values.isOn === true);
    return reply(lights.length ? `${lights.length} ${lights.length === 1 ? 'light is' : 'lights are'} on: ${nameList(lights)}. Simulation settings.`
      : 'None of the lights in this scope are on in the simulation.', lights);
  }
  if (/^(?:what['’]s on|what is on|which devices are on)(?: here| in this room| in my home)?$/.test(text)) {
    const devices = context.devices.filter((device) => device.values.isOn === true);
    return reply(devices.length ? `${devices.length} devices are on: ${nameList(devices)}. Simulation settings.`
      : 'None of the supported power controls in this scope are on in the simulation.', devices);
  }
  if (/^(?:what (?:devices|can i control)(?: are)?(?: here| in this room)?|list (?:my )?devices(?: here| in this room)?)$/.test(text)) {
    const devices = context.devices.filter((device) => device.controllable);
    return reply(devices.length ? `You can control ${devices.length} comfort devices: ${nameList(devices)}.` : 'No comfort controls are available in this scope.', devices);
  }
  if (/^what(?: is|['’]s) (?:the )?(?:temperature|target temperature)(?: set to)?(?: here| in this room)?$/.test(text)) {
    const devices = context.devices.filter((device) => device.kind === 'ac' && device.values.tempC !== undefined);
    return reply(devices.length ? `${devices.slice(0, 4).map((device) => `${device.roomName} is set to ${device.values.tempC} degrees Celsius`).join('. ')}. These are target settings, not measured room temperatures.`
      : 'There is no supported air-conditioning target in this scope.', devices);
  }
  return { kind: 'cloud' };
}
