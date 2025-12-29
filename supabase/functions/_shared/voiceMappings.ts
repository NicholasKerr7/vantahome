export type DeviceTraits = {
  supportsOnOff: boolean;
  supportsBrightness: boolean;
  supportsTemp: boolean;
};

export function getTraits(kind: string): DeviceTraits {
  switch (kind) {
    case 'light':
      return { supportsOnOff: true, supportsBrightness: true, supportsTemp: false };
    case 'ac':
      return { supportsOnOff: true, supportsBrightness: false, supportsTemp: true };
    default:
      return { supportsOnOff: true, supportsBrightness: false, supportsTemp: false };
  }
}

export function alexaDisplayCategory(kind: string) {
  switch (kind) {
    case 'light':
      return 'LIGHT';
    case 'ac':
      return 'THERMOSTAT';
    case 'tv':
      return 'TV';
    case 'fan':
      return 'FAN';
    case 'camera':
      return 'CAMERA';
    default:
      return 'SWITCH';
  }
}

export function googleDeviceType(kind: string) {
  switch (kind) {
    case 'light':
      return 'action.devices.types.LIGHT';
    case 'ac':
      return 'action.devices.types.THERMOSTAT';
    case 'tv':
      return 'action.devices.types.TV';
    case 'fan':
      return 'action.devices.types.FAN';
    case 'camera':
      return 'action.devices.types.CAMERA';
    default:
      return 'action.devices.types.SWITCH';
  }
}

export function googleTraits(kind: string) {
  const traits = ['action.devices.traits.OnOff'];
  const caps = getTraits(kind);
  if (caps.supportsBrightness) traits.push('action.devices.traits.Brightness');
  if (caps.supportsTemp) traits.push('action.devices.traits.TemperatureSetting');
  return traits;
}

export function buildAlexaCapabilities(kind: string) {
  const caps = getTraits(kind);
  const base = [
    { type: 'AlexaInterface', interface: 'Alexa', version: '3' },
    {
      type: 'AlexaInterface',
      interface: 'Alexa.PowerController',
      version: '3',
      properties: { supported: [{ name: 'powerState' }], retrievable: true },
    },
  ];
  if (caps.supportsBrightness) {
    base.push({
      type: 'AlexaInterface',
      interface: 'Alexa.BrightnessController',
      version: '3',
      properties: { supported: [{ name: 'brightness' }], retrievable: true },
    });
  }
  if (caps.supportsTemp) {
    base.push({
      type: 'AlexaInterface',
      interface: 'Alexa.ThermostatController',
      version: '3',
      properties: { supported: [{ name: 'targetSetpoint' }], retrievable: true },
    });
  }
  return base;
}

export function buildAlexaProperties(kind: string, state: Record<string, unknown>) {
  const caps = getTraits(kind);
  const now = new Date().toISOString();
  const props: Array<Record<string, unknown>> = [
    {
      namespace: 'Alexa.PowerController',
      name: 'powerState',
      value: (state.isOn ?? false) ? 'ON' : 'OFF',
      timeOfSample: now,
      uncertaintyInMilliseconds: 500,
    },
  ];

  if (caps.supportsBrightness) {
    props.push({
      namespace: 'Alexa.BrightnessController',
      name: 'brightness',
      value: state.brightness ?? 0,
      timeOfSample: now,
      uncertaintyInMilliseconds: 500,
    });
  }

  if (caps.supportsTemp) {
    props.push({
      namespace: 'Alexa.ThermostatController',
      name: 'targetSetpoint',
      value: { value: state.tempC ?? 22, scale: 'CELSIUS' },
      timeOfSample: now,
      uncertaintyInMilliseconds: 500,
    });
  }

  return props;
}

export function googleState(kind: string, state: Record<string, unknown>) {
  const caps = getTraits(kind);
  const payload: Record<string, unknown> = {
    online: true,
    on: Boolean(state.isOn ?? false),
  };
  if (caps.supportsBrightness) {
    payload.brightness = Number(state.brightness ?? 0);
  }
  if (caps.supportsTemp) {
    payload.thermostatMode = 'cool';
    payload.thermostatTemperatureSetpoint = Number(state.tempC ?? 22);
  }
  return payload;
}
