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

type ModalCardProps = PropsWithChildren<{
  visible: boolean;
  onRequestClose: () => void;
  onBackdropPress?: () => void;
  colors: readonly [string, string, ...string[]];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  cardStyle?: StyleProp<ViewStyle>;
  overlayStyle?: StyleProp<ViewStyle>;
  backdropStyle?: StyleProp<ViewStyle>;
  animationType?: "none" | "slide" | "fade";
  keyboardBehavior?: KeyboardAvoidingViewProps["behavior"];
}>;

export default function ModalCard({
  visible,
  onRequestClose,
  onBackdropPress,
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
        <Pressable style={backdrop} onPress={handleBackdropPress} />
        <KeyboardAvoidingView behavior={keyboardBehavior}>
          <LinearGradient colors={colors} start={start} end={end} style={cardStyle}>
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
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 18,
  },
  backdrop: { ...StyleSheet.absoluteFillObject },
});
