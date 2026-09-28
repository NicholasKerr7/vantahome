import React from 'react';
import { Platform, Switch, type ColorValue, type SwitchProps } from 'react-native';
import { theme } from '../theme/theme';

const DEFAULT_TRACK_COLORS = { false: theme.colors.stroke, true: theme.colors.accent2 };

export type ThemedSwitchProps = Omit<SwitchProps, 'accessibilityLabel'> & {
  /** Describe the preference or device state changed by this control. */
  accessibilityLabel: string;
  /** Optional on-state thumb color; thumbColor applies to both states when omitted. */
  activeThumbColor?: ColorValue;
};

/** Apply shared switch colors while adapting RN Web's separate active-thumb API. */
export default function ThemedSwitch({
  thumbColor = theme.colors.text,
  activeThumbColor = thumbColor,
  trackColor = DEFAULT_TRACK_COLORS,
  ...props
}: ThemedSwitchProps) {
  // Native accepts one current thumb color; RN Web otherwise uses its teal on-state default.
  const currentThumbColor = props.value ? activeThumbColor : thumbColor;
  const webThumb = Platform.OS === 'web' ? { activeThumbColor } : {};
  return (
    <Switch
      {...props}
      {...webThumb}
      accessibilityLabel={props.accessibilityLabel}
      thumbColor={Platform.OS === 'web' ? thumbColor : currentThumbColor}
      trackColor={trackColor}
    />
  );
}
