import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { ScrollView, StyleSheet, Text, type LayoutChangeEvent } from 'react-native';
import Pressable from '../../components/Pressable';
import type { AutomationFlow, AutomationRule, Scene } from '../../store/useHomeStore';
import { EmbeddedAutomations, EmbeddedScenes } from './EmbeddedCollections';

let mockFontScale = 1;
let mockHeight = 844;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: mockHeight, scale: 1, fontScale: mockFontScale }),
}));

jest.mock('@expo/vector-icons/Ionicons', () => {
  const { View } = require('react-native');
  return View;
});

type TestNode = { props: { accessibilityLabel?: string; testID?: string; children?: React.ReactNode; disabled?: boolean; accessibilityRole?: string; onPress: () => void; onValueChange: () => void } };
const scenes: Scene[] = Array.from({ length: 13 }, (_, index) => ({ id: `scene-${index}`, name: `Scene ${index}`, roomId: 'living', actions: [] }));
const flows: AutomationFlow[] = Array.from({ length: 8 }, (_, index) => ({ id: `flow-${index}`, name: `Flow ${index}`, enabled: index % 2 === 0, triggers: [], conditions: [], actions: [] }));
const rules: AutomationRule[] = Array.from({ length: 7 }, (_, index) => ({ id: `rule-${index}`, name: `Schedule ${index}`, enabled: true, trigger: { type: 'time', hour: index + 6, minute: 30 }, action: { type: 'toggle', deviceId: 'light', on: true } }));

/** Deliver a real layout-shaped event to exercise the same bounded sizing used on phones. */
function measure(tree: ReactTestRenderer, testID: string, width: number, height: number) {
  const event = { nativeEvent: { layout: { x: 0, y: 0, width, height } } } as LayoutChangeEvent;
  act(() => { tree.root.findByProps({ testID }).props.onLayout(event); });
}

/** Find custom controls before their native hosts, avoiding duplicate press invocations. */
function button(tree: ReactTestRenderer, label: string) {
  return tree.root.findAllByType(Pressable).find((node: TestNode) => node.props.accessibilityLabel === label)!;
}

/** Extract rendered item identities without depending on private component state. */
function visibleIds(tree: ReactTestRenderer, prefix: string): string[] {
  return tree.root.findAll((node: TestNode) => typeof node.props.testID === 'string' && node.props.testID.startsWith(prefix)).map((node: TestNode) => node.props.testID!).filter((id: string, index: number, ids: string[]) => ids.indexOf(id) === index);
}

describe('Embedded feature collections', () => {
  let tree: ReactTestRenderer | undefined;
  beforeEach(() => { mockFontScale = 1; mockHeight = 844; });
  afterEach(() => { if (tree) act(() => { tree!.unmount(); }); tree = undefined; jest.restoreAllMocks(); });

  it('reduces schedule capacity when Dynamic Type grows and keeps every routine reachable', () => {
    const props = { flows, rules, onNewFlow: jest.fn(), onOpenFlow: jest.fn(), onToggleFlow: jest.fn(), onAddSchedule: jest.fn(), onOpenSchedule: jest.fn(), onToggleSchedule: jest.fn() };
    act(() => { tree = renderer.create(<EmbeddedAutomations {...props} />); });
    act(() => { button(tree!, 'Schedules, 7').props.onPress(); });
    measure(tree!, 'routine-page-area', 288, 460);
    expect(visibleIds(tree!, 'routine-row-')).toHaveLength(2);
    mockFontScale = 1.5;
    act(() => { tree!.update(<EmbeddedAutomations {...props} />); });
    expect(visibleIds(tree!, 'routine-row-')).toHaveLength(1);
    const seen = new Set<string>();
    for (let index = 0; index < rules.length; index++) {
      visibleIds(tree!, 'routine-row-').forEach((id) => seen.add(id));
      const next = button(tree!, 'Next schedules page');
      if (next.props.disabled) break;
      act(() => { next.props.onPress(); });
    }
    expect(seen.size).toBe(rules.length);
    mockFontScale = 1;
    act(() => { tree!.update(<EmbeddedAutomations {...props} />); });
    expect(visibleIds(tree!, 'routine-row-')).toEqual(['routine-row-rule-6']);
    expect(button(tree!, 'Next schedules page').props.disabled).toBe(true);
  });

  it.each([[0.8, 2, 280], [1.5, 1, undefined], [2, 1, undefined]])('fits scene rows at font scale %s without an undersized height cap', (fontScale, capacity, maxHeight) => {
    mockFontScale = fontScale;
    act(() => { tree = renderer.create(<EmbeddedScenes scenes={scenes} rooms={[]} activeSceneId={null} onCreate={jest.fn()} onClear={jest.fn()} onOpen={jest.fn()} onRun={jest.fn()} />); });
    measure(tree!, 'scene-page-area', 288, 570);
    expect(visibleIds(tree!, 'scene-tile-')).toHaveLength(capacity);
    expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'scene-row-0' }).props.style).maxHeight).toBe(maxHeight);
    expect(tree!.root.findAllByType(ScrollView)).toHaveLength(0);
  });

  it.each([[288, 245, 1], [780, 680, 4], [1100, 550, 4]])('pages every scene within %sx%s without a page scroller', (width, height, expectedCapacity) => {
    act(() => { tree = renderer.create(<EmbeddedScenes scenes={scenes} rooms={[]} activeSceneId={null} onCreate={jest.fn()} onClear={jest.fn()} onOpen={jest.fn()} onRun={jest.fn()} />); });
    measure(tree!, 'scene-page-area', width, height);
    expect(tree!.root.findAllByType(ScrollView)).toHaveLength(0);
    expect(visibleIds(tree!, 'scene-tile-')).toHaveLength(expectedCapacity);
    const seen = new Set<string>();
    for (let index = 0; index < scenes.length; index++) {
      visibleIds(tree!, 'scene-tile-').forEach((id) => seen.add(id));
      const next = button(tree!, 'Next scenes page');
      if (next.props.disabled) break;
      act(() => { next.props.onPress(); });
    }
    expect(seen.size).toBe(scenes.length);
    expect(button(tree!, 'Next scenes page').props.disabled).toBe(true);
  });

  it('preserves scene actions and clamps a later page after data shrinks or the screen rotates', () => {
    const props = { scenes, rooms: [], activeSceneId: 'scene-0', onCreate: jest.fn(), onClear: jest.fn(), onOpen: jest.fn(), onRun: jest.fn() };
    act(() => { tree = renderer.create(<EmbeddedScenes {...props} />); });
    act(() => { button(tree!, 'Run Scene 0').props.onPress(); button(tree!, 'Details for Scene 0').props.onPress(); button(tree!, 'Create scene').props.onPress(); button(tree!, 'Clear active scene').props.onPress(); });
    expect(props.onRun).toHaveBeenCalledWith('scene-0');
    expect(props.onOpen).toHaveBeenCalledWith('scene-0');
    expect(props.onCreate).toHaveBeenCalledTimes(1);
    expect(props.onClear).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 12; index++) act(() => { button(tree!, 'Next scenes page').props.onPress(); });
    measure(tree!, 'scene-page-area', 780, 680);
    expect(visibleIds(tree!, 'scene-tile-')).toEqual(['scene-tile-scene-12']);
    act(() => { tree!.update(<EmbeddedScenes {...props} scenes={scenes.slice(0, 2)} />); });
    expect(visibleIds(tree!, 'scene-tile-')).toEqual(['scene-tile-scene-0', 'scene-tile-scene-1']);
    expect(button(tree!, 'Previous scenes page').props.disabled).toBe(true);
  });

  it('keeps flow editing, independent enable switches, and paged schedules reachable', () => {
    const props = { flows, rules, onNewFlow: jest.fn(), onOpenFlow: jest.fn(), onToggleFlow: jest.fn(), onAddSchedule: jest.fn(), onOpenSchedule: jest.fn(), onToggleSchedule: jest.fn() };
    act(() => { tree = renderer.create(<EmbeddedAutomations {...props} />); });
    measure(tree!, 'routine-page-area', 288, 199);
    expect(tree!.root.findAllByType(ScrollView)).toHaveLength(0);
    expect(visibleIds(tree!, 'routine-row-')).toEqual(['routine-row-flow-0']);
    act(() => { button(tree!, 'Flow 0 enabled').props.onPress(); });
    expect(props.onToggleFlow).toHaveBeenCalledWith('flow-0');
    expect(props.onOpenFlow).not.toHaveBeenCalled();
    act(() => { button(tree!, 'Edit Flow 0').props.onPress(); button(tree!, 'New flow').props.onPress(); });
    expect(props.onNewFlow).toHaveBeenCalledTimes(1);
    expect(props.onOpenFlow).toHaveBeenCalledWith('flow-0');
    act(() => { button(tree!, 'Next flows page').props.onPress(); });
    expect(visibleIds(tree!, 'routine-row-')).toEqual(['routine-row-flow-1']);
    act(() => { button(tree!, 'Schedules, 7').props.onPress(); });
    expect(visibleIds(tree!, 'routine-row-')).toEqual(['routine-row-rule-0']);
    act(() => { button(tree!, 'Edit Schedule 0').props.onPress(); button(tree!, 'Schedule 0 enabled').props.onPress(); });
    act(() => { button(tree!, 'Add schedule').props.onPress(); });
    expect(props.onAddSchedule).toHaveBeenCalledTimes(1);
    expect(props.onOpenSchedule).toHaveBeenCalledWith('rule-0');
    expect(props.onToggleSchedule).toHaveBeenCalledWith('rule-0');
    const seen = new Set<string>();
    for (let index = 0; index < rules.length; index++) {
      visibleIds(tree!, 'routine-row-').forEach((id) => seen.add(id));
      const next = button(tree!, 'Next schedules page');
      if (next.props.disabled) break;
      act(() => { next.props.onPress(); });
    }
    expect(seen.size).toBe(rules.length);
  });

  it('keeps creation, editing, paging, and toggles reachable in the short-phone dock area', () => {
    mockHeight = 562;
    act(() => { tree = renderer.create(<EmbeddedAutomations flows={flows} rules={rules} onNewFlow={jest.fn()} onOpenFlow={jest.fn()} onToggleFlow={jest.fn()} onAddSchedule={jest.fn()} onOpenSchedule={jest.fn()} onToggleSchedule={jest.fn()} />); });
    measure(tree!, 'routine-page-area', 288, 180);
    expect(visibleIds(tree!, 'routine-row-')).toHaveLength(1);
    for (const label of ['New flow', 'Edit Flow 0', 'Next flows page']) {
      expect(StyleSheet.flatten(button(tree!, label).props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
    expect(tree!.root.findAllByType(Pressable).filter((node: TestNode) => node.props.accessibilityRole === 'switch')).toHaveLength(1);
    expect(tree!.root.findAllByType(ScrollView)).toHaveLength(0);
  });

  it('renders a real trigger and action preview instead of only rule counts', () => {
    const flow: AutomationFlow = { id: 'evening', name: 'Evening reminder', enabled: true, triggers: [{ type: 'time', hour: 18, minute: 45 }], conditions: [{ type: 'day', days: ['Fri'] }], actions: [{ type: 'notify', message: 'Close the windows' }] };
    act(() => { tree = renderer.create(<EmbeddedAutomations flows={[flow]} rules={[]} onNewFlow={jest.fn()} onOpenFlow={jest.fn()} onToggleFlow={jest.fn()} onAddSchedule={jest.fn()} onOpenSchedule={jest.fn()} onToggleSchedule={jest.fn()} />); });
    measure(tree!, 'routine-page-area', 390, 280);
    const text = tree!.root.findAllByType(Text).map((node: TestNode) => node.props.children);
    expect(text).toContain('At 18:45');
    expect(text).toContain('Notify: Close the windows');
    expect(text).toContain('Enabled');
    expect(button(tree!, 'Evening reminder enabled').props.accessibilityRole).toBe('switch');
  });

  it('shows useful empty states with their create actions and disabled pagers', () => {
    act(() => { tree = renderer.create(<EmbeddedAutomations flows={[]} rules={[]} onNewFlow={jest.fn()} onOpenFlow={jest.fn()} onToggleFlow={jest.fn()} onAddSchedule={jest.fn()} onOpenSchedule={jest.fn()} onToggleSchedule={jest.fn()} />); });
    expect(tree!.root.findAllByType(Text).some((node: TestNode) => node.props.children === 'A little less to think about.')).toBe(true);
    expect(button(tree!, 'Next flows page').props.disabled).toBe(true);
    expect(button(tree!, 'Previous flows page').props.disabled).toBe(true);
  });
});
