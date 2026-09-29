import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Platform, StyleSheet, type ViewProps } from 'react-native';
import Pressable from '../../components/Pressable';
import { theme } from '../../theme/theme';
import { RoutineCard } from './CollectionCards';

jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);

type ToggleNode = { props: { accessibilityRole?: string; accessibilityState?: { checked: boolean; disabled: boolean }; disabled?: boolean; 'aria-checked'?: boolean; children: React.ReactElement<ViewProps>; style: ViewProps['style']; onPress: () => void; onFocus: () => void; onBlur: () => void; onKeyDown?: (event: { key: string; repeat?: boolean; preventDefault: () => void }) => void } };
const base = { id: 'flow', name: 'Morning', when: 'At 07:00', then: 'Light on', actionCount: 1, conditionCount: 0, compact: true, onOpen: jest.fn() };

/** Select the semantic switch independently of the card's edit control. */
function toggleNode(tree: ReactTestRenderer): ToggleNode {
  return tree.root.findAllByType(Pressable).find((node: ToggleNode) => node.props.accessibilityRole === 'switch');
}

describe('RoutineCard toggle', () => {
  let tree: ReactTestRenderer;
  afterEach(() => { if (tree) act(() => { tree.unmount(); }); jest.restoreAllMocks(); });

  it.each([false, true])('keeps a 44px target and centered fixed-size track with checked=%s', (enabled) => {
    act(() => { tree = renderer.create(<RoutineCard {...base} enabled={enabled} onToggle={jest.fn()} />); });
    const toggle = toggleNode(tree);
    expect(toggle.props.accessibilityState).toEqual({ checked: enabled, disabled: false });
    expect(toggle.props['aria-checked']).toBe(enabled);
    expect(StyleSheet.flatten(toggle.props.style)).toMatchObject({ minWidth: 52, minHeight: 44, alignItems: 'center', justifyContent: 'center' });
    const track = toggle.props.children;
    expect(StyleSheet.flatten(track.props.style)).toMatchObject({ width: 44, height: 26, padding: 3 });
    const thumb = track.props.children as React.ReactElement<ViewProps>;
    expect(StyleSheet.flatten(thumb.props.style)).toMatchObject({ width: 20, height: 20, alignSelf: enabled ? 'flex-end' : 'flex-start' });
  });

  it('activates web Space once, ignores repeats, and leaves Enter to RN Web', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const onToggle = jest.fn();
    act(() => { tree = renderer.create(<RoutineCard {...base} enabled={false} onToggle={onToggle} />); });
    const toggle = toggleNode(tree);
    const preventDefault = jest.fn();
    act(() => { toggle.props.onKeyDown!({ key: ' ', preventDefault }); });
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    act(() => { toggle.props.onKeyDown!({ key: ' ', repeat: true, preventDefault }); });
    expect(onToggle).toHaveBeenCalledTimes(1);
    act(() => { toggle.props.onKeyDown!({ key: 'Enter', preventDefault }); });
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(2);
    act(() => { toggle.props.onPress(); });
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('keeps a read-only switch disabled for both touch and web keyboard input', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const onToggle = jest.fn();
    act(() => { tree = renderer.create(<RoutineCard {...base} enabled readOnly onToggle={onToggle} />); });
    const toggle = toggleNode(tree);
    expect(toggle.props.accessibilityState).toEqual({ checked: true, disabled: true });
    expect(toggle.props.disabled).toBe(true);
    act(() => { toggle.props.onKeyDown!({ key: ' ', preventDefault: jest.fn() }); });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('preserves native press activation and an explicit visible focus state', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const onToggle = jest.fn();
    act(() => { tree = renderer.create(<RoutineCard {...base} enabled onToggle={onToggle} />); });
    expect(toggleNode(tree).props.onKeyDown).toBeUndefined();
    act(() => { toggleNode(tree).props.onPress(); toggleNode(tree).props.onFocus(); });
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(StyleSheet.flatten(toggleNode(tree).props.style).borderColor).toBe(theme.colors.accent);
    act(() => { toggleNode(tree).props.onBlur(); });
    expect(StyleSheet.flatten(toggleNode(tree).props.style).borderColor).toBe('transparent');
  });
});
