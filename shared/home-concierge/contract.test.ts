import {
  COMFORT_KINDS, CONCIERGE_RESPONSE_JSON_SCHEMA, MAX_CONCIERGE_ACTIONS, MAX_CONCIERGE_DEVICES,
  parseConciergeRequest, parseConciergeResponse, parseConciergeValues, type ConciergeDevice,
} from './contract';

const devices: ConciergeDevice[] = [
  { id: 'light-1', kind: 'light', controllable: true },
  { id: 'ac-1', kind: 'ac', controllable: true },
  { id: 'blind-1', kind: 'blinds', controllable: true },
  { id: 'tv-1', kind: 'tv', controllable: false },
];

/** A small simulation envelope with no names, rooms, account profile or raw model state. */
function request() {
  return { homeId: 'home-1', question: 'Make the living room relaxing', context: {
    mode: 'simulation', capturedAt: 1_700_000_000_000, devices: [{ id: 'light-1', values: { isOn: true, brightness: 70 } }],
  } };
}

/** A review-only scene response; nothing in this protocol can select a command transport. */
function response() {
  return { title: 'Evening calm', answer: 'A soft lighting scene for review.', deviceIds: ['light-1'],
    scene: { name: 'Evening calm', explanation: 'Warm, gently dimmed light.', actions: [{ deviceId: 'light-1', values: { isOn: true, brightness: 25, colorTempK: 2700 } }] } };
}

test('accepts the bounded request while rejecting metadata outside the whitelist', () => {
  expect(parseConciergeRequest(request())).toEqual(request());
  expect(parseConciergeRequest({ ...request(), profile: { email: 'private@example.invalid' } })).toBeNull();
  expect(parseConciergeRequest({ ...request(), context: { ...request().context, location: 'private' } })).toBeNull();
  expect(parseConciergeRequest({ ...request(), context: { ...request().context, devices: [{ ...request().context.devices[0], name: 'Private name' }] } })).toBeNull();
});

test.each(['', ' '.repeat(20), 'x'.repeat(601), 'bad\u0000question'])('rejects invalid question %p', (question) => {
  expect(parseConciergeRequest({ ...request(), question })).toBeNull();
});

test('rejects duplicate, unbounded, malformed and empty snapshot references', () => {
  for (const changed of [[], Array(MAX_CONCIERGE_DEVICES + 1).fill(request().context.devices[0]),
    [request().context.devices[0], request().context.devices[0]], [{ id: '../secret', values: { isOn: true } }],
    [{ id: 'light-1', values: {} }], [{ id: 'light-1', values: { isOn: true, streamUrl: 'private' } }]]) {
    expect(parseConciergeRequest({ ...request(), context: { ...request().context, devices: changed } })).toBeNull();
  }
  expect(parseConciergeRequest({ ...request(), context: { ...request().context, mode: 'live' } })).toBeNull();
  expect(parseConciergeRequest({ ...request(), context: { ...request().context, capturedAt: Infinity } })).toBeNull();
});

test('normalizes nullable provider values and preserves explicit false and zero', () => {
  expect(parseConciergeValues({ isOn: false, brightness: 0, tempC: null, volume: null, openPercent: null, colorTempK: null }, 'light'))
    .toEqual({ isOn: false, brightness: 0 });
  expect(parseConciergeValues({ isOn: null, brightness: null })).toBeNull();
  expect(parseConciergeValues([])).toBeNull();
  expect(parseConciergeValues(new Date())).toBeNull();
});

test.each([
  ['brightness', -1], ['brightness', 101], ['brightness', 30.5], ['tempC', 14], ['tempC', 29],
  ['colorTempK', 1900], ['colorTempK', 6600], ['colorTempK', 2750], ['volume', Infinity], ['isOn', 'true'],
  ['openPercent', NaN], ['gasValveOpen', true], ['__proto__', {}],
])('rejects invalid field/value %s=%s', (field, value) => {
  expect(parseConciergeValues({ [field]: value })).toBeNull();
});

test('enforces exact kind fields, excluding windows and sensitive target families', () => {
  expect(parseConciergeValues({ tempC: 22 }, 'light')).toBeNull();
  expect(parseConciergeValues({ isOn: true }, 'blinds')).toBeNull();
  expect(parseConciergeValues({ openPercent: 20 }, 'blinds')).toEqual({ openPercent: 20 });
  expect(COMFORT_KINDS).not.toEqual(expect.arrayContaining(['window']));
  const directory = [{ id: 'light-1', kind: 'gate', controllable: true }] as unknown as ConciergeDevice[];
  expect(parseConciergeResponse(response(), directory, true)).toBeNull();
});

test('accepts reviewable scene and grounded read-only response', () => {
  expect(parseConciergeResponse(response(), devices, true)).toEqual(response());
  expect(parseConciergeResponse({ ...response(), scene: null }, devices, false)?.scene).toBeNull();
  expect(parseConciergeResponse(response(), devices, false)).toBeNull();
});

test('rejects hidden, duplicate and noncontrollable references or action targets', () => {
  expect(parseConciergeResponse({ ...response(), deviceIds: ['camera-1'] }, devices, true)).toBeNull();
  expect(parseConciergeResponse({ ...response(), deviceIds: ['light-1', 'light-1'] }, devices, true)).toBeNull();
  expect(parseConciergeResponse({ ...response(), deviceIds: [] }, devices, true)).toBeNull();
  expect(parseConciergeResponse({ ...response(), scene: { ...response().scene, actions: [response().scene.actions[0], response().scene.actions[0]] } }, devices, true)).toBeNull();
  expect(parseConciergeResponse({ ...response(), deviceIds: ['tv-1'], scene: { ...response().scene, actions: [{ deviceId: 'tv-1', values: { isOn: true } }] } }, devices, true)).toBeNull();
});

test('rejects added tools, model preset metadata, invalid patches and unbounded outputs', () => {
  expect(parseConciergeResponse({ ...response(), tool: 'execute' }, devices, true)).toBeNull();
  expect(parseConciergeResponse({ ...response(), answer: 'x'.repeat(1201) }, devices, true)).toBeNull();
  expect(parseConciergeResponse({ ...response(), scene: { ...response().scene, modelPreset: 'night' } }, devices, true)).toBeNull();
  expect(parseConciergeResponse({ ...response(), scene: { ...response().scene, actions: [] } }, devices, true)).toBeNull();
  expect(parseConciergeResponse({ ...response(), scene: { ...response().scene, actions: Array(MAX_CONCIERGE_ACTIONS + 1).fill(response().scene.actions[0]) } }, devices, true)).toBeNull();
  expect(parseConciergeResponse({ ...response(), scene: { ...response().scene, actions: [{ deviceId: 'light-1', values: { tempC: 23 } }] } }, devices, true)).toBeNull();
});

test('strict provider schema requires nullable optional fields rather than optional object properties', () => {
  const schema = CONCIERGE_RESPONSE_JSON_SCHEMA.properties.scene.anyOf[1];
  const values = schema.properties.actions.items.properties.values;
  expect(values.additionalProperties).toBe(false);
  expect([...values.required]).toEqual(Object.keys(values.properties));
  expect(values.properties.isOn.type).toContain('null');
});
