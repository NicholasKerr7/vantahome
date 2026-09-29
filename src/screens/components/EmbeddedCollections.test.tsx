import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { ScrollView, StyleSheet, Text, type LayoutChangeEvent } from 'react-native';
import Pressable from '../../components/Pressable';
import type { AutomationFlow, AutomationRule, Scene } from '../../store/useHomeStore';
import { selectRoutines } from '../../store/routines';
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

const routines = selectRoutines({ rules, flows });
/** Build the shared collection contract used by both schedules and advanced routines. */
function routineProps() { return { routines, onCreate: jest.fn(), onOpen: jest.fn(), onToggle: jest.fn() }; }

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

  it('reduces capacity with Dynamic Type and keeps every normalized routine reachable', () => {
    const props = routineProps();
    act(() => { tree = renderer.create(<EmbeddedAutomations {...props} />); });
    measure(tree!, 'routine-page-area', 288, 460);
    expect(visibleIds(tree!, 'routine-row-')).toHaveLength(2);
    mockFontScale = 1.5;
    act(() => { tree!.update(<EmbeddedAutomations {...props} />); });
    expect(visibleIds(tree!, 'routine-row-')).toHaveLength(1);
    const seen = new Set<string>();
    for (let index = 0; index < routines.length; index++) {
      visibleIds(tree!, 'routine-row-').forEach((id) => seen.add(id));
      const next = button(tree!, 'Next routines page');
      if (next.props.disabled) break;
      act(() => { next.props.onPress(); });
    }
    expect(seen.size).toBe(routines.length);
    mockFontScale = 1;
    act(() => { tree!.update(<EmbeddedAutomations {...props} />); });
    expect(button(tree!, 'Next routines page').props.disabled).toBe(true);
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
    act(() => { button(tree!, 'Run Scene 0').props.onPress(); button(tree!, 'Details for Scene 0').props.onPress(); button(tree!, 'Create scene').props.onPress(); button(tree!, 'Clear last-used scene').props.onPress(); });
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

  it('has one creation path and preserves independent editing and enable actions', () => {
    const props = routineProps();
    act(() => { tree = renderer.create(<EmbeddedAutomations {...props} />); });
    measure(tree!, 'routine-page-area', 288, 199);
    const first = routines[0];
    expect(tree!.root.findAllByType(ScrollView)).toHaveLength(0);
    expect(visibleIds(tree!, 'routine-row-')).toEqual([`routine-row-${first.id}`]);
    act(() => { button(tree!, `${first.name} enabled`).props.onPress(); });
    expect(props.onToggle).toHaveBeenCalledWith(first.id);
    expect(props.onOpen).not.toHaveBeenCalled();
    act(() => { button(tree!, `Edit ${first.name}`).props.onPress(); button(tree!, 'New routine').props.onPress(); });
    expect(props.onCreate).toHaveBeenCalledTimes(1);
    expect(props.onOpen).toHaveBeenCalledWith(first.id);
    expect(tree!.root.findAllByType(Pressable).filter((node: TestNode) => node.props.accessibilityRole === 'tab')).toHaveLength(0);
    const seen = new Set<string>();
    for (let index = 0; index < routines.length; index++) {
      visibleIds(tree!, 'routine-row-').forEach((id) => seen.add(id));
      const next = button(tree!, 'Next routines page');
      if (next.props.disabled) break;
      act(() => { next.props.onPress(); });
    }
    expect(seen.size).toBe(routines.length);
  });

  it('keeps creation, editing, paging and toggles reachable in the short-phone dock area', () => {
    mockHeight = 562;
    act(() => { tree = renderer.create(<EmbeddedAutomations {...routineProps()} />); });
    measure(tree!, 'routine-page-area', 288, 180);
    expect(visibleIds(tree!, 'routine-row-')).toHaveLength(1);
    for (const label of ['New routine', `Edit ${routines[0].name}`, 'Next routines page']) {
      expect(StyleSheet.flatten(button(tree!, label).props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
    expect(tree!.root.findAllByType(Pressable).filter((node: TestNode) => node.props.accessibilityRole === 'switch')).toHaveLength(1);
    expect(tree!.root.findAllByType(ScrollView)).toHaveLength(0);
  });

  it('renders actual steps and the foreground-only execution limit', () => {
    const flow: AutomationFlow = { id: 'evening', name: 'Evening reminder', enabled: true, triggers: [{ type: 'time', hour: 18, minute: 45 }], conditions: [{ type: 'day', days: ['Fri'] }], actions: [{ type: 'notify', message: 'Close the windows' }] };
    act(() => { tree = renderer.create(<EmbeddedAutomations {...routineProps()} routines={selectRoutines({ flows: [flow], rules: [] })} />); });
    measure(tree!, 'routine-page-area', 390, 280);
    const text = tree!.root.findAllByType(Text).map((node: TestNode) => node.props.children);
    expect(text).toContain('At 18:45');
    expect(text).toContain('Notify: Close the windows');
    expect(text).toContain('Runs while app is open · Hub not connected');
    expect(button(tree!, 'Evening reminder enabled').props.accessibilityRole).toBe('switch');
  });

  it('exposes a visible escape from the device-specific routine filter', () => {
    const onClearFilter = jest.fn();
    act(() => { tree = renderer.create(<EmbeddedAutomations {...routineProps()} deviceName="Pendant" onClearFilter={onClearFilter} />); });
    act(() => { button(tree!, 'All routines').props.onPress(); });
    expect(onClearFilter).toHaveBeenCalledTimes(1);
    expect(StyleSheet.flatten(button(tree!, 'All routines').props.style).minHeight).toBeGreaterThanOrEqual(44);
  });

  it('keeps cards readable but disables every mutation for view-only members', () => {
    act(() => { tree = renderer.create(<EmbeddedAutomations {...routineProps()} canManage={false} />); });
    for (const label of ['New routine', `Edit ${routines[0].name}`, `${routines[0].name} enabled`]) {
      expect(button(tree!, label).props.disabled).toBe(true);
    }
    expect(visibleIds(tree!, 'routine-row-')).toHaveLength(1);
    expect(tree!.root.findAllByType(Text).some((node: TestNode) => node.props.children === 'View only · Ask your household owner to make changes')).toBe(true);
  });

  it('shows a useful empty state with one create action and disabled pagers', () => {
    act(() => { tree = renderer.create(<EmbeddedAutomations {...routineProps()} routines={[]} />); });
    expect(tree!.root.findAllByType(Text).some((node: TestNode) => node.props.children === 'A little less to think about.')).toBe(true);
    expect(button(tree!, 'Next routines page').props.disabled).toBe(true);
    expect(button(tree!, 'Previous routines page').props.disabled).toBe(true);
  });
});
