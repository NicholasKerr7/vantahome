import { isPlainObject } from "./validation.ts";
import { getTraits } from "./voiceMappings.ts";

function sampleTime(value: unknown): number | null {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp < 0) return null;
  const canonical = value.replace(/(?:\.(\d{1,3}))?Z$/, (_match, fraction) =>
    `.${String(fraction ?? "").padEnd(3, "0")}Z`);
  return new Date(timestamp).toISOString() === canonical ? timestamp : null;
}

/** Build retrievable properties only from complete, timestamped observations. */
export function buildAlexaObservedProperties(
  kind: string,
  state: Record<string, unknown>,
  now = Date.now(),
): Array<Record<string, unknown>> | null {
  if (!Number.isSafeInteger(now) || now < 0 || !isPlainObject(state) ||
      !isPlainObject(state.observations)) return null;

  const traits = getTraits(kind);
  if (typeof state.isOn !== "boolean") return null;
  const fields: Array<{ key: string; namespace: string; name: string; value: unknown }> = [
    { key: "isOn", namespace: "Alexa.PowerController", name: "powerState", value: state.isOn ? "ON" : "OFF" },
  ];
  if (traits.supportsBrightness) {
    if (typeof state.brightness !== "number" || !Number.isInteger(state.brightness) ||
        state.brightness < 0 || state.brightness > 100) return null;
    fields.push({ key: "brightness", namespace: "Alexa.BrightnessController", name: "brightness", value: state.brightness });
  }
  if (traits.supportsTemp) {
    if (typeof state.tempC !== "number" || !Number.isFinite(state.tempC) ||
        state.tempC < 10 || state.tempC > 35) return null;
    fields.push({ key: "tempC", namespace: "Alexa.ThermostatController", name: "targetSetpoint", value: { value: state.tempC, scale: "CELSIUS" } });
  }

  const properties: Array<Record<string, unknown>> = [];
  for (const field of fields) {
    const observation = state.observations[field.key];
    if (!isPlainObject(observation)) return null;
    const changedAt = sampleTime(observation.timeOfSample);
    const confirmedAt = sampleTime(observation.lastConfirmedAt);
    if (changedAt === null || confirmedAt === null || changedAt > confirmedAt || confirmedAt > now) return null;

    // The trusted integration records each property's sample/confirmation time.
    // Database receipt time and HTTP response time cannot substitute for either.
    properties.push({
      namespace: field.namespace,
      name: field.name,
      value: field.value,
      timeOfSample: new Date(changedAt).toISOString(),
      uncertaintyInMilliseconds: now - confirmedAt,
    });
  }
  return properties;
}
