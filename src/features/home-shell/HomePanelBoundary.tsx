import React, { Component, type PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Pressable from '../../components/Pressable';
import { theme } from '../../theme/theme';

/** Contain optional panel failures so the house and its navigation stay usable. */
export default class HomePanelBoundary extends Component<PropsWithChildren<{ onClose: () => void }>, { failed: boolean }> {
  state = { failed: false };

  /** Replace a failed lazy module or child render with a recoverable panel. */
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }

  /** Closing unmounts the failed panel; the user can reopen it without losing the house. */
  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return <View accessibilityRole="alert" style={styles.card}>
      <Text style={styles.title}>This panel couldn’t open</Text>
      <Text style={styles.detail}>Close it and try again. Your house controls are still saved.</Text>
      <Pressable accessibilityLabel="Close unavailable panel" onPress={this.props.onClose} style={styles.button}><Text style={styles.label}>Back to home</Text></Pressable>
    </View>;
  }
}

const styles = StyleSheet.create({
  card: { padding: 22, gap: 16, backgroundColor: theme.colors.bg0, borderRadius: theme.radius.lg },
  title: { color: theme.colors.text, fontSize: 18, fontWeight: '600' },
  detail: { color: theme.colors.subtext, fontSize: 14, lineHeight: 20 },
  button: { minHeight: 44, padding: 12, backgroundColor: theme.colors.card, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center' },
  label: { color: theme.colors.accentText, fontSize: 14, fontWeight: '600' },
});
