import React from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../theme/theme';

/** Draw a switch inside a single accessible parent; the mark never adds a second touch target. */
export default function SwitchMark({ checked }: { checked: boolean }) {
  return <View style={styles.target} pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={[styles.track, checked && styles.trackOn]}><View style={[styles.thumb, checked && styles.thumbOn]} /></View>
  </View>;
}

const styles = StyleSheet.create({
  target: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  track: { width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: theme.colors.stroke },
  trackOn: { backgroundColor: theme.colors.accent2 },
  thumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.text },
  thumbOn: { transform: [{ translateX: 18 }] },
});
