import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { ScrollView, StyleSheet, Switch, Text, type LayoutChangeEvent } from 'react-native';
import Pressable from '../../components/Pressable';
import type { AutomationFlow, AutomationRule, Scene } from '../../store/useHomeStore';
import { EmbeddedAutomations, EmbeddedScenes } from './EmbeddedCollections';

let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 1, fontScale: mockFontScale }),
}));

jest.mock('@expo/vector-icons/Ionicons', () => {
  const { View } = require('react-native');
  return View;
});

type TestNode = { props: { accessibilityLabel?: string; testID?: string; children?: React.ReactNode; disabled?: boolean; onPress: () => void; onValueChange: () => void } };
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
  beforeEach(() => { mockFontScale = 1; });
  afterEach(() => { if (tree) act(() => { tree!.unmount(); }); tree = undefined; jest.restoreAllMocks(); });

  it('reduces schedule capacity when Dynamic Type grows and keeps every routine reachable', () => {
    const props = { flows, rules, onNewFlow: jest.fn(), onOpenFlow: jest.fn(), onToggleFlow: jest.fn(), onAddSchedule: jest.fn(), onOpenSchedule: jest.fn(), onToggleSchedule: jest.fn() };
    act(() => { tree = renderer.create(<EmbeddedAutomations {...props} />); });
    act(() => { button(tree!, 'Schedules, 7').props.onPress(); });
    measure(tree!, 'routine-page-area', 288, 306);
    expect(visibleIds(tree!, 'routine-row-')).toHaveLength(3);
    mockFontScale = 1.5;
    act(() => { tree!.update(<EmbeddedAutomations {...props} />); });
    expect(visibleIds(tree!, 'routine-row-')).toHaveLength(2);
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

  it.each([[0.8, 3, 244], [1.5, 2, undefined], [2, 1, undefined]])('fits scene rows at font scale %s without an undersized height cap', (fontScale, capacity, maxHeight) => {
    mockFontScale = fontScale;
    act(() => { tree = renderer.create(<EmbeddedScenes scenes={scenes} rooms={[]} activeSceneId={null} onCreate={jest.fn()} onClear={jest.fn()} onOpen={jest.fn()} onRun={jest.fn()} />); });
    measure(tree!, 'scene-page-area', 288, 570);
    expect(visibleIds(tree!, 'scene-tile-')).toHaveLength(capacity);
    expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'scene-row-0' }).props.style).maxHeight).toBe(maxHeight);
    expect(tree!.root.findAllByType(ScrollView)).toHaveLength(0);
  });

  it.each([[288, 245, 1], [780, 680, 6], [1100, 550, 4]])('pages every scene within %sx%s without a page scroller', (width, height, expectedCapacity) => {
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
    act(() => { tree!.root.findByType(Switch).props.onValueChange(); });
    expect(props.onToggleFlow).toHaveBeenCalledWith('flow-0');
    expect(props.onOpenFlow).not.toHaveBeenCalled();
    act(() => { button(tree!, 'Edit Flow 0').props.onPress(); });
    expect(props.onOpenFlow).toHaveBeenCalledWith('flow-0');
    act(() => { button(tree!, 'Next flows page').props.onPress(); });
    expect(visibleIds(tree!, 'routine-row-')).toEqual(['routine-row-flow-1']);
    act(() => { button(tree!, 'Schedules, 7').props.onPress(); });
    expect(visibleIds(tree!, 'routine-row-')).toEqual(['routine-row-rule-0']);
    act(() => { button(tree!, 'Edit Schedule 0').props.onPress(); tree!.root.findByType(Switch).props.onValueChange(); });
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

  it('shows useful empty states with their create actions and disabled pagers', () => {
    act(() => { tree = renderer.create(<EmbeddedAutomations flows={[]} rules={[]} onNewFlow={jest.fn()} onOpenFlow={jest.fn()} onToggleFlow={jest.fn()} onAddSchedule={jest.fn()} onOpenSchedule={jest.fn()} onToggleSchedule={jest.fn()} />); });
    expect(tree!.root.findAllByType(Text).some((node: TestNode) => node.props.children === 'A little less to think about.')).toBe(true);
    expect(button(tree!, 'Next flows page').props.disabled).toBe(true);
    expect(button(tree!, 'Previous flows page').props.disabled).toBe(true);
  });
});
