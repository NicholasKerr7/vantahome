import React from 'react';
import { Platform, StyleSheet, Switch } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import ThemedSwitch from './ThemedSwitch';
import { theme } from '../theme/theme';

const styles = StyleSheet.create({ target: { minHeight: 44, minWidth: 52 } });

describe('ThemedSwitch', () => {
  let tree: ReactTestRenderer | undefined;
  afterEach(() => {
    if (tree) act(() => { tree!.unmount(); });
    tree = undefined;
    jest.restoreAllMocks();
  });

  it.each(['web', 'ios', 'android'] as const)('keeps the default thumb ivory in both states on %s', (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    for (const value of [false, true]) {
      act(() => {
        if (tree) tree.update(<ThemedSwitch accessibilityLabel="Example control" value={value} />);
        else tree = renderer.create(<ThemedSwitch accessibilityLabel="Example control" value={value} />);
      });
      const props = tree!.root.findByType(Switch).props;
      expect(props.thumbColor).toBe(theme.colors.text);
      expect(props.activeThumbColor).toBe(platform === 'web' ? theme.colors.text : undefined);
      expect(props.trackColor).toEqual({ false: theme.colors.stroke, true: theme.colors.accent2 });
    }
  });

  it.each(['web', 'ios', 'android'] as const)('supports separate active and inactive thumb colors on %s', (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    const thumbColor = theme.colors.subtext;
    const activeThumbColor = theme.colors.accent;
    for (const value of [false, true]) {
      const element = <ThemedSwitch accessibilityLabel="Example control" value={value} thumbColor={thumbColor} activeThumbColor={activeThumbColor} />;
      act(() => { if (tree) tree.update(element); else tree = renderer.create(element); });
      const props = tree!.root.findByType(Switch).props;
      expect(props.thumbColor).toBe(platform === 'web' || !value ? thumbColor : activeThumbColor);
      expect(props.activeThumbColor).toBe(platform === 'web' ? activeThumbColor : undefined);
    }
  });

  it('preserves caller track colors, touch sizing, accessibility, and value changes', () => {
    const onValueChange = jest.fn();
    const trackColor = { false: '#101010', true: '#505050' };
    act(() => { tree = renderer.create(<ThemedSwitch accessibilityLabel="Haptics" disabled={false} value={false} onValueChange={onValueChange} trackColor={trackColor} style={styles.target} />); });
    const props = tree!.root.findByType(Switch).props;
    expect(props).toMatchObject({ accessibilityLabel: 'Haptics', disabled: false, value: false, trackColor });
    expect(StyleSheet.flatten(props.style)).toEqual({ minHeight: 44, minWidth: 52 });
    act(() => { props.onValueChange(true); });
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});
