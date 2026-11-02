import { LightingConnectionRehearsal } from '../lightingConnectionRehearsal';
import type { LightingConsoleActions, LightingConsoleModel } from '../lightingConsoleModel';

// Fail the suite if the isolated rehearsal ever imports persistence or a home transport.
jest.mock('../../../store/useHomeStore', () => { throw new Error('Rehearsal must not load home state.'); });
jest.mock('../../../services/deviceClient', () => { throw new Error('Rehearsal must not load physical commands.'); });
jest.mock('../../three-d-home/simulationControlClient', () => { throw new Error('Rehearsal must not load simulation commands.'); });
jest.mock('@react-native-async-storage/async-storage', () => { throw new Error('Rehearsal must not load persistence.'); });

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** Compare observed fields independently of command feedback and availability. */
function observed(model: LightingConsoleModel) {
  return { on: model.on, brightness: model.brightness, colorMode: model.colorMode, color: model.color, temperatureK: model.temperatureK };
}

/** Complete only this bounded mock command's acknowledgement and sample timers. */
function confirmCommand(): void {
  jest.advanceTimersByTime(1000);
}

test('starts with explicit dimmer capabilities and a stable, dark, known sample', () => {
  const rehearsal = new LightingConnectionRehearsal();
  const snapshot = rehearsal.getSnapshot();
  expect(rehearsal.getSnapshot()).toBe(snapshot);
  expect(snapshot).toMatchObject({ profile: 'dimmer', scenario: 'normal', phase: 'idle', active: true, canControl: true });
  expect(snapshot.model).toMatchObject({ on: false, brightness: 50, temperatureK: 3000, colorMode: 'temperature', previewBrightness: 0,
    capabilities: { power: true, brightness: { min: 0, max: 100, step: 5 }, temperature: null, color: false } });
  expect(snapshot.model.feedback).toMatch(/Demo sample/);
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot.model)).toBe(true);
  expect(Object.isFrozen(snapshot.model.capabilities)).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test('sending and acknowledgement preserve observations until a later sample confirms intent', () => {
  const rehearsal = new LightingConnectionRehearsal();
  const initial = observed(rehearsal.getSnapshot().model);
  rehearsal.actions.toggle();
  const sending = rehearsal.getSnapshot();
  expect(sending.phase).toBe('sending');
  expect(sending.canControl).toBe(false);
  expect(observed(sending.model)).toEqual(initial);
  rehearsal.actions.toggle();
  rehearsal.actions.adjustBrightness(1);
  expect(rehearsal.getSnapshot()).toBe(sending);
  jest.advanceTimersByTime(200);
  const acknowledged = rehearsal.getSnapshot();
  expect(acknowledged.phase).toBe('awaiting');
  expect(acknowledged.detail).toMatch(/Demo command acknowledged/);
  expect(acknowledged.canControl).toBe(false);
  expect(observed(acknowledged.model)).toEqual(initial);
  expect(acknowledged.model.previewBrightness).toBe(0);
  rehearsal.actions.toggle();
  expect(rehearsal.getSnapshot()).toBe(acknowledged);
  jest.advanceTimersByTime(799);
  expect(rehearsal.getSnapshot()).toBe(acknowledged);
  jest.advanceTimersByTime(1);
  expect(rehearsal.getSnapshot()).toMatchObject({ phase: 'confirmed', canControl: true, model: { on: true, brightness: 50, previewBrightness: 50 } });
  expect(rehearsal.getSnapshot().detail).toMatch(/Demo sample confirmed by a simulated observation/);
  expect(jest.getTimerCount()).toBe(0);
});

test('delayed observation and failure each finish within their bounded scenario time', () => {
  const rehearsal = new LightingConnectionRehearsal();
  rehearsal.setScenario('delayed');
  rehearsal.actions.toggle();
  jest.advanceTimersByTime(3199);
  expect(rehearsal.getSnapshot()).toMatchObject({ phase: 'awaiting', model: { on: false } });
  jest.advanceTimersByTime(1);
  expect(rehearsal.getSnapshot()).toMatchObject({ phase: 'confirmed', model: { on: true } });
  rehearsal.setScenario('failure');
  rehearsal.actions.adjustBrightness(1);
  jest.advanceTimersByTime(599);
  expect(rehearsal.getSnapshot()).toMatchObject({ phase: 'awaiting', model: { on: true, brightness: 50 } });
  jest.advanceTimersByTime(1);
  expect(rehearsal.getSnapshot()).toMatchObject({ phase: 'failed', canControl: true, model: { on: true, brightness: 50 } });
  expect(rehearsal.getSnapshot().detail).toMatch(/Demo command failed/);
  expect(jest.getTimerCount()).toBe(0);
});

test.each(['profile', 'scenario', 'offline', 'background', 'dispose'] as const)(
  '%s cancellation ignores even callbacks already queued outside the timer registry', (reason) => {
    const timerSpy = jest.spyOn(global, 'setTimeout');
    const rehearsal = new LightingConnectionRehearsal();
    const listener = jest.fn();
    rehearsal.subscribe(listener);
    rehearsal.actions.toggle();
    const oldCallbacks = timerSpy.mock.calls.map(([callback]) => callback);
    jest.advanceTimersByTime(200);
    if (reason === 'profile') rehearsal.setProfile('switch');
    if (reason === 'scenario') rehearsal.setScenario('delayed');
    if (reason === 'offline') rehearsal.setScenario('offline');
    if (reason === 'background') rehearsal.setActive(false);
    if (reason === 'dispose') rehearsal.dispose();
    const cancelled = rehearsal.getSnapshot();
    const notifications = listener.mock.calls.length;
    expect(jest.getTimerCount()).toBe(0);
    oldCallbacks.forEach((callback) => { if (typeof callback === 'function') callback(); });
    jest.advanceTimersByTime(10000);
    expect(rehearsal.getSnapshot()).toBe(cancelled);
    expect(listener).toHaveBeenCalledTimes(notifications);
  },
);

test('a stale command cannot overwrite a new profile command after reset', () => {
  const timerSpy = jest.spyOn(global, 'setTimeout');
  const rehearsal = new LightingConnectionRehearsal();
  rehearsal.actions.adjustBrightness(1);
  const oldCallbacks = timerSpy.mock.calls.map(([callback]) => callback);
  rehearsal.setProfile('color');
  rehearsal.actions.setColor('#b69cff');
  oldCallbacks.forEach((callback) => { if (typeof callback === 'function') callback(); });
  expect(rehearsal.getSnapshot()).toMatchObject({ phase: 'sending', model: { on: false, brightness: 50, colorMode: 'temperature' } });
  confirmCommand();
  expect(rehearsal.getSnapshot()).toMatchObject({ phase: 'confirmed', model: { on: false, brightness: 50, colorMode: 'color', color: '#B69CFF' } });
});

test('offline retains a last-known sample, hides illumination and refuses commands', () => {
  const rehearsal = new LightingConnectionRehearsal();
  rehearsal.actions.toggle();
  confirmCommand();
  rehearsal.setScenario('offline');
  const offline = rehearsal.getSnapshot();
  expect(offline).toMatchObject({ canControl: false, model: { on: true, brightness: 50, previewBrightness: 0 } });
  expect(offline.model.status).toMatch(/offline.*Last known sample/);
  rehearsal.actions.toggle();
  rehearsal.actions.adjustBrightness(-1);
  expect(rehearsal.getSnapshot()).toBe(offline);
  expect(jest.getTimerCount()).toBe(0);
});

test.each(['stale', 'background'] as const)('%s exposes unknown readings and cannot imply a glowing lamp', (reason) => {
  const rehearsal = new LightingConnectionRehearsal();
  rehearsal.actions.toggle();
  confirmCommand();
  rehearsal.actions.adjustBrightness(1);
  if (reason === 'stale') rehearsal.setScenario('stale');
  else rehearsal.setActive(false);
  const unavailable = rehearsal.getSnapshot();
  expect(unavailable).toMatchObject({ phase: 'interrupted', canControl: false, model: {
    on: null, brightness: null, color: null, colorMode: null, temperatureK: null, previewBrightness: 0, manual: false,
  } });
  rehearsal.actions.toggle();
  expect(rehearsal.getSnapshot()).toBe(unavailable);
  if (reason === 'stale') rehearsal.setScenario('normal');
  else rehearsal.setActive(true);
  jest.advanceTimersByTime(10000);
  expect(rehearsal.getSnapshot()).toMatchObject({ canControl: true, model: { on: true, brightness: 50 } });
});

const invalidCommands: Array<[string, (actions: LightingConsoleActions) => void]> = [
  ['invalid direction', (actions) => actions.adjustBrightness(2 as 1)],
  ['string direction', (actions) => actions.adjustBrightness('1' as unknown as 1)],
  ['invalid mode', (actions) => actions.setMode('party' as 'color')],
  ['too-warm preset', (actions) => actions.setTemperature(2400)],
  ['temperature above maximum', (actions) => actions.setTemperature(6501)],
  ['fractional temperature', (actions) => actions.setTemperature(3000.5)],
  ['NaN temperature', (actions) => actions.setTemperature(Number.NaN)],
  ['infinite temperature', (actions) => actions.setTemperature(Infinity)],
  ['string temperature', (actions) => actions.setTemperature('3000' as unknown as number)],
  ['short hex', (actions) => actions.setColor('#fff')],
  ['CSS color', (actions) => actions.setColor('red')],
  ['malformed hex', (actions) => actions.setColor('#zz0000')],
  ['alpha hex', (actions) => actions.setColor('#ff000080')],
  ['missing color', (actions) => actions.setColor(null as unknown as string)],
];

test.each(invalidCommands)('rejects %s without changing readings or scheduling work', (_label, invoke) => {
  const rehearsal = new LightingConnectionRehearsal();
  rehearsal.setProfile('color');
  const before = observed(rehearsal.getSnapshot().model);
  invoke(rehearsal.actions);
  expect(observed(rehearsal.getSnapshot().model)).toEqual(before);
  expect(rehearsal.getSnapshot().phase).toBe('failed');
  expect(rehearsal.getSnapshot().detail).toMatch(/^Demo/);
  expect(jest.getTimerCount()).toBe(0);
});

test.each(['switch', 'dimmer'] as const)('%s refuses unsupported capabilities and exposes only its declared profile', (profile) => {
  const rehearsal = new LightingConnectionRehearsal();
  rehearsal.setProfile(profile);
  const sample = observed(rehearsal.getSnapshot().model);
  expect(sample.brightness).toBe(profile === 'switch' ? null : 50);
  expect(rehearsal.getSnapshot().model.capabilities).toMatchObject({ power: true, color: false, temperature: null });
  rehearsal.actions.setMode('color');
  rehearsal.actions.setMode('temperature');
  rehearsal.actions.setColor('#123456');
  rehearsal.actions.setTemperature(3000);
  if (profile === 'switch') rehearsal.actions.adjustBrightness(1);
  expect(observed(rehearsal.getSnapshot().model)).toEqual(sample);
  expect(jest.getTimerCount()).toBe(0);
  rehearsal.actions.toggle();
  confirmCommand();
  expect(rehearsal.getSnapshot().model).toMatchObject({ on: true, previewBrightness: profile === 'switch' ? 100 : 50 });
});

test('brightness respects both bounds, retains independent power and stays dark at zero', () => {
  const rehearsal = new LightingConnectionRehearsal();
  for (let index = 0; index < 10; index += 1) {
    rehearsal.actions.adjustBrightness(-1);
    confirmCommand();
  }
  expect(rehearsal.getSnapshot().model).toMatchObject({ on: false, brightness: 0, previewBrightness: 0 });
  rehearsal.actions.adjustBrightness(-1);
  expect(rehearsal.getSnapshot().phase).toBe('failed');
  expect(jest.getTimerCount()).toBe(0);
  rehearsal.actions.toggle();
  confirmCommand();
  expect(rehearsal.getSnapshot().model).toMatchObject({ on: true, brightness: 0, previewBrightness: 0 });
  for (let index = 0; index < 20; index += 1) {
    rehearsal.actions.adjustBrightness(1);
    confirmCommand();
  }
  expect(rehearsal.getSnapshot().model).toMatchObject({ on: true, brightness: 100, previewBrightness: 100 });
  rehearsal.actions.adjustBrightness(1);
  expect(rehearsal.getSnapshot().phase).toBe('failed');
  expect(jest.getTimerCount()).toBe(0);
});

test('color, white and mode settings preserve power; power off retains every setting', () => {
  const rehearsal = new LightingConnectionRehearsal();
  rehearsal.setProfile('color');
  expect(rehearsal.getSnapshot().model.capabilities.temperature).toEqual({ min: 2700, max: 6500 });
  rehearsal.actions.setTemperature(2700);
  confirmCommand();
  rehearsal.actions.setTemperature(6500);
  confirmCommand();
  rehearsal.actions.setColor('#12abef');
  confirmCommand();
  rehearsal.actions.setMode('temperature');
  confirmCommand();
  expect(rehearsal.getSnapshot().model).toMatchObject({ on: false, color: '#12ABEF', temperatureK: 6500, colorMode: 'temperature', previewBrightness: 0 });
  rehearsal.actions.toggle();
  confirmCommand();
  const illuminated = rehearsal.getSnapshot().model;
  rehearsal.actions.toggle();
  confirmCommand();
  expect(observed(rehearsal.getSnapshot().model)).toEqual({ ...observed(illuminated), on: false });
  expect(rehearsal.getSnapshot().model.previewBrightness).toBe(0);
});

test('subscriptions clean up idempotently and disposal cannot publish or accept commands', () => {
  const rehearsal = new LightingConnectionRehearsal();
  const listener = jest.fn();
  const unsubscribe = rehearsal.subscribe(listener);
  rehearsal.actions.toggle();
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  unsubscribe();
  confirmCommand();
  expect(listener).toHaveBeenCalledTimes(1);
  rehearsal.subscribe(listener);
  rehearsal.dispose();
  rehearsal.dispose();
  const disposed = rehearsal.getSnapshot();
  rehearsal.subscribe(listener)();
  rehearsal.actions.toggle();
  rehearsal.setProfile('switch');
  rehearsal.setScenario('failure');
  rehearsal.setActive(false);
  expect(rehearsal.getSnapshot()).toBe(disposed);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('instances have no shared state or retained commands after a new demo is created', () => {
  const first = new LightingConnectionRehearsal();
  const second = new LightingConnectionRehearsal();
  const untouched = second.getSnapshot();
  first.setProfile('color');
  first.actions.toggle();
  confirmCommand();
  first.dispose();
  expect(second.getSnapshot()).toBe(untouched);
  expect(new LightingConnectionRehearsal().getSnapshot()).toMatchObject({ profile: 'dimmer', model: { on: false, brightness: 50 } });
});

test('a listener that closes during submission leaves no timers or later publications', () => {
  const rehearsal = new LightingConnectionRehearsal();
  const listener = jest.fn(() => rehearsal.dispose());
  rehearsal.subscribe(listener);
  rehearsal.actions.toggle();
  jest.advanceTimersByTime(10000);
  expect(jest.getTimerCount()).toBe(0);
  expect(listener).toHaveBeenCalledTimes(1);
});
