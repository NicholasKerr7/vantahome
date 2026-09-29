import React, { type PropsWithChildren } from "react";
import {
  Modal,
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  type StyleProp,
  type ViewStyle,
  type KeyboardAvoidingViewProps,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Pressable from "./Pressable";
import { theme } from "../theme/theme";

type ModalCardProps = PropsWithChildren<{
  visible: boolean;
  onRequestClose: () => void;
  onBackdropPress?: () => void;
  /** Label the optional outside-tap dismissal target for assistive technology. */
  backdropAccessibilityLabel?: string;
  colors: readonly [string, string, ...string[]];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  cardStyle?: StyleProp<ViewStyle>;
  overlayStyle?: StyleProp<ViewStyle>;
  backdropStyle?: StyleProp<ViewStyle>;
  animationType?: "none" | "slide" | "fade";
  keyboardBehavior?: KeyboardAvoidingViewProps["behavior"];
}>;

/** Keep deep editors on one opaque purple surface with room for their pinned actions. */
export default function ModalCard({
  visible,
  onRequestClose,
  onBackdropPress,
  backdropAccessibilityLabel,
  colors,
  start = { x: 0.1, y: 0.1 },
  end = { x: 1, y: 1 },
  cardStyle,
  overlayStyle,
  backdropStyle,
  animationType = "fade",
  keyboardBehavior = Platform.select({ ios: "padding", android: undefined }),
  children,
}: ModalCardProps) {
  const overlay = [styles.overlay, overlayStyle];
  const backdrop = [styles.backdrop, backdropStyle];
  const handleBackdropPress = onBackdropPress ?? onRequestClose;

  return (
    <Modal
      transparent
      visible={visible}
      animationType={animationType}
      onRequestClose={onRequestClose}
    >
      <View style={overlay}>
        <Pressable
          style={backdrop}
          onPress={handleBackdropPress}
          accessibilityLabel={backdropAccessibilityLabel}
        />
        <KeyboardAvoidingView behavior={keyboardBehavior} style={styles.keyboard}>
          <LinearGradient colors={colors} start={start} end={end} style={[styles.card, cardStyle]}>
            {children}
          </LinearGradient>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlayStrong,
    justifyContent: "center",
    padding: 18,
  },
  keyboard: { width: '100%', maxWidth: 720, maxHeight: '100%', flexShrink: 1, alignSelf: 'center' },
  card: { backgroundColor: theme.colors.bg0, borderRadius: 28, overflow: 'hidden', flexShrink: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject },
});
