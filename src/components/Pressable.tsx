import React from 'react';
import {
  Pressable as RNPressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = PressableProps & {
  pressedStyle?: StyleProp<ViewStyle>;
  disablePressedStyle?: boolean;
};

const DEFAULT_PRESSED_STYLE: ViewStyle = { opacity: 0.75 };

export default function Pressable({ style, pressedStyle, disablePressedStyle, ...props }: Props) {
  const applyPressedStyle = !disablePressedStyle;

  if (typeof style === 'function') {
    return (
      <RNPressable
        {...props}
        style={(state) => {
          const base = style(state);
          if (!state.pressed || !applyPressedStyle) return base;
          return [base, DEFAULT_PRESSED_STYLE, pressedStyle];
        }}
      />
    );
  }

  return (
    <RNPressable
      {...props}
      style={({ pressed }) => [
        style,
        pressed && applyPressedStyle && DEFAULT_PRESSED_STYLE,
        pressed && applyPressedStyle && pressedStyle,
      ]}
    />
  );
}
