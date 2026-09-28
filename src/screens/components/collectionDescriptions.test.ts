import type { AutomationFlow, Device, HouseholdMember, Scene } from '../../store/useHomeStore';
import { collectionTime, describeAction, describeCondition, describeFlow, describeTrigger, sceneDeviceSummary, sceneIdentity, type CollectionDirectory } from './collectionDescriptions';

const light = { id: 'light', name: 'Bedside lamp', kind: 'light' } as Device;
const ac = { id: 'ac', name: 'Bedroom AC', kind: 'ac' } as Device;
const scene: Scene = { id: 'night', name: 'Wind down', roomId: 'bedroom', actions: [{ type: 'patch', deviceId: 'light', patch: { brightness: 25 } }] };
const directory: CollectionDirectory = { devices: [light, ac], scenes: [scene], household: [{ id: 'nick', name: 'Nick' } as HouseholdMember] };

describe('collection descriptions', () => {
  it('uses the actual schedule, device, scene, and presence trigger values', () => {
    expect(collectionTime(6, 5)).toBe('06:05');
    expect(describeTrigger({ type: 'time', hour: 6, minute: 5 }, directory)).toBe('At 06:05');
    expect(describeTrigger({ type: 'device', deviceId: 'light', state: 'off' }, directory)).toBe('Bedside lamp turns off');
    expect(describeTrigger({ type: 'scene', sceneId: 'night' }, directory)).toBe('Wind down runs');
    expect(describeTrigger({ type: 'presence', memberId: 'nick', status: 'home' }, directory)).toBe('Nick arrives home');
    expect(describeTrigger({ type: 'presence', memberId: 'nick', status: 'away' }, directory)).toBe('Nick leaves home');
  });

  it('shows real conditions and does not invent a day restriction', () => {
    expect(describeCondition({ type: 'time-range', startHour: 17, startMinute: 0, endHour: 23, endMinute: 30 }, directory)).toBe('17:00–23:30');
    expect(describeCondition({ type: 'device', deviceId: 'light', state: 'on' }, directory)).toBe('Bedside lamp is on');
    expect(describeCondition({ type: 'day', days: ['Mon', 'Wed'] }, directory)).toBe('Mon, Wed');
    expect(describeCondition({ type: 'day', days: [] }, directory)).toBe('No days selected');
  });

  it('describes every supported action without claiming it already ran', () => {
    expect(describeAction({ type: 'toggle', deviceId: 'light', on: false }, directory)).toBe('Bedside lamp off');
    expect(describeAction({ type: 'set-ac', deviceId: 'ac', tempC: 21, mode: 'cold' }, directory)).toBe('Bedroom AC → 21°C');
    expect(describeAction({ type: 'set-brightness', deviceId: 'light', brightness: 25 }, directory)).toBe('Bedside lamp → 25%');
    expect(describeAction({ type: 'run-scene', sceneId: 'night' }, directory)).toBe('Run Wind down');
    expect(describeAction({ type: 'delay', seconds: 30 }, directory)).toBe('Wait 30 seconds');
    expect(describeAction({ type: 'notify', message: 'Window is open' }, directory)).toBe('Notify: Window is open');
  });

  it('accounts for additional entries and presents incomplete flows honestly', () => {
    const flow: AutomationFlow = { id: 'flow', name: 'Arrive', enabled: true, triggers: [{ type: 'presence', memberId: 'nick', status: 'home' }, { type: 'time', hour: 18, minute: 0 }], conditions: [{ type: 'day', days: ['Mon'] }], actions: [{ type: 'toggle', deviceId: 'light', on: true }, { type: 'set-ac', deviceId: 'ac', tempC: 21, mode: 'cold' }] };
    expect(describeFlow(flow, directory)).toEqual({ when: 'Nick arrives home + 1 more', condition: 'Mon', then: 'Bedside lamp on + 1 more' });
    expect(describeFlow({ ...flow, triggers: [], conditions: [], actions: [] }, directory)).toEqual({ when: 'No trigger configured', condition: null, then: 'No action configured' });
  });

  it('derives scene identity from visible devices and avoids exposing hidden IDs', () => {
    expect(sceneIdentity(scene, directory)).toBe('rest');
    expect(sceneIdentity({ ...scene, actions: [{ type: 'toggle', deviceId: 'light', on: false }] }, directory)).toBe('off');
    expect(sceneIdentity({ ...scene, actions: [{ type: 'patch', deviceId: 'light', patch: { brightness: 80 } }] }, directory)).toBe('light');
    expect(sceneIdentity({ ...scene, actions: [{ type: 'patch', deviceId: 'light', patch: { armed: true } }] }, directory)).toBe('security');
    expect(sceneDeviceSummary([...scene.actions, ...scene.actions], directory)).toBe('Bedside lamp');
    expect(sceneDeviceSummary([], directory)).toBe('No device actions yet');
    expect(sceneDeviceSummary(scene.actions, { ...directory, devices: [] })).toBe('Unavailable device');
    expect(describeAction({ type: 'toggle', deviceId: 'secret-id', on: true }, directory)).toBe('Unavailable device on');
    expect(describeTrigger({ type: 'scene', sceneId: 'secret-scene' }, directory)).toBe('Unavailable scene runs');
  });
});
