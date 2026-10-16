import React, { useContext } from "react";
import { CardScrollInteractionContext } from './cardScrollInteraction';
import {
  Pressable as RNPressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type Props = PressableProps & {
  pressedStyle?: StyleProp<ViewStyle>;
  disablePressedStyle?: boolean;
};

const DEFAULT_PRESSED_STYLE: ViewStyle = { opacity: 0.75 };

export default function Pressable({
  style,
  pressedStyle,
  disablePressedStyle,
  accessibilityRole = "button",
  onPress,
  onLongPress,
  ...props
}: Props) {
  const applyPressedStyle = !disablePressedStyle;
  const canActivate = useContext(CardScrollInteractionContext);
  // Only card scrolling supplies this guard; controls elsewhere retain their existing behavior.
  const actionProps = {
    onPress: canActivate && onPress ? (event: Parameters<NonNullable<PressableProps['onPress']>>[0]) => { if (canActivate()) onPress(event); } : onPress,
    onLongPress: canActivate && onLongPress ? (event: Parameters<NonNullable<PressableProps['onLongPress']>>[0]) => { if (canActivate()) onLongPress(event); } : onLongPress,
  };

  if (typeof style === "function") {
    return (
      <RNPressable
        {...props}
        {...actionProps}
        accessibilityRole={accessibilityRole}
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
      {...actionProps}
      accessibilityRole={accessibilityRole}
      style={({ pressed }) => [
        style,
        pressed && applyPressedStyle && DEFAULT_PRESSED_STYLE,
        pressed && applyPressedStyle && pressedStyle,
      ]}
    />
  );
}
