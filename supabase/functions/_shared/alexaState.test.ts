import { buildAlexaObservedProperties } from "./alexaState";

const now = Date.parse("2026-09-14T12:02:00.000Z");
const samples = {
  isOn: { timeOfSample: "2026-09-14T12:00:00.000Z", lastConfirmedAt: "2026-09-14T12:01:50.000Z" },
  brightness: { timeOfSample: "2026-09-14T11:59:00.000Z", lastConfirmedAt: "2026-09-14T12:01:00.000Z" },
};
const light = { isOn: false, brightness: 12, observations: samples };

describe("Alexa observation provenance", () => {
  test("retains distinct device sample times and accounts for confirmation age", () => {
    expect(buildAlexaObservedProperties("light", light, now)).toEqual([
      { namespace: "Alexa.PowerController", name: "powerState", value: "OFF", timeOfSample: samples.isOn.timeOfSample, uncertaintyInMilliseconds: 10_000 },
      { namespace: "Alexa.BrightnessController", name: "brightness", value: 12, timeOfSample: samples.brightness.timeOfSample, uncertaintyInMilliseconds: 60_000 },
    ]);
    const later = buildAlexaObservedProperties("light", light, now + 30_000)!;
    expect(later[0].timeOfSample).toBe(samples.isOn.timeOfSample);
    expect(later[0].uncertaintyInMilliseconds).toBe(40_000);
  });

  test.each([
    {}, { isOn: false }, { isOn: false, brightness: 0 },
    { ...light, observations: null },
    { ...light, observations: { isOn: samples.isOn } },
    { ...light, isOn: "false" }, { ...light, brightness: "12" },
    { ...light, brightness: -1 }, { ...light, brightness: 101 },
    { ...light, brightness: 12.5 }, { ...light, brightness: NaN },
  ])("does not invent values or timestamps for incomplete observations %#", (state) => {
    expect(buildAlexaObservedProperties("light", state, now)).toBeNull();
  });

  test.each([
    { timeOfSample: "invalid", lastConfirmedAt: samples.isOn.lastConfirmedAt },
    { timeOfSample: samples.isOn.timeOfSample, lastConfirmedAt: "invalid" },
    { timeOfSample: "2026-02-30T12:00:00Z", lastConfirmedAt: samples.isOn.lastConfirmedAt },
    { timeOfSample: samples.isOn.timeOfSample, lastConfirmedAt: "2026-09-14T12:03:00Z" },
    { timeOfSample: "2026-09-14T12:02:00Z", lastConfirmedAt: samples.isOn.lastConfirmedAt },
    { timeOfSample: now, lastConfirmedAt: now },
  ])("rejects invalid, future or reversed observation times %#", (sample) => {
    expect(buildAlexaObservedProperties("light", {
      ...light, observations: { ...samples, isOn: sample },
    }, now)).toBeNull();
  });

  test("supports a confirmed thermostat value without manufacturing brightness", () => {
    const properties = buildAlexaObservedProperties("ac", {
      isOn: true, tempC: 21.5,
      observations: { isOn: samples.isOn, tempC: samples.brightness },
    }, now)!;
    expect(properties.map((property) => property.name)).toEqual(["powerState", "targetSetpoint"]);
    expect(properties[1].value).toEqual({ value: 21.5, scale: "CELSIUS" });
  });

  test.each([undefined, "22", NaN, Infinity, 9, 36])("rejects an unavailable or invalid thermostat reading %#", (tempC) => {
    expect(buildAlexaObservedProperties("ac", {
      isOn: true, tempC, observations: { isOn: samples.isOn, tempC: samples.brightness },
    }, now)).toBeNull();
  });

  test("only requires the supported power observation for a fan", () => {
    expect(buildAlexaObservedProperties("fan", {
      isOn: true, observations: { isOn: samples.isOn },
    }, now)).toHaveLength(1);
  });
});
