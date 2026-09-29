import React, { useMemo, type PropsWithChildren, type ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../theme/theme";

/** Limit a dialog to the safe viewport so its field area can shrink above the keyboard. */
export function useModalViewportStyle() {
  const { height } = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();
  return useMemo(
    () =>
      StyleSheet.create({
        card: { maxHeight: Math.max(0, height - top - bottom - 36) },
      }).card,
    [height, top, bottom],
  );
}

/** Let long forms scroll independently while save and dismissal actions remain reachable. */
export default function ModalForm({
  children,
  footer,
  testID,
}: PropsWithChildren<{
  footer: ReactNode;
  testID?: string;
}>) {
  return (
    <View style={styles.form} testID={testID}>
      <ScrollView
        style={styles.fields}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bounces={false}
        overScrollMode="never"
      >
        {children}
      </ScrollView>
      <View style={styles.footer}>{footer}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { flexShrink: 1, minHeight: 0 },
  fields: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  content: { paddingBottom: 12 },
  footer: {
    flexShrink: 0,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.stroke,
  },
});
