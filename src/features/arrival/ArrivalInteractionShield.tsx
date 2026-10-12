import React from 'react';
import { StyleSheet, View } from 'react-native';

export type ArrivalInteractionShieldProps = { blocked: boolean; hidden: boolean; children: React.ReactNode };

/** Shield native input and accessibility while keeping the authorized renderer mounted. */
export default function ArrivalInteractionShield({ blocked, hidden, children }: ArrivalInteractionShieldProps) {
  return <View style={[styles.fill, hidden && styles.hidden]} pointerEvents={blocked ? 'none' : 'auto'}
    accessibilityElementsHidden={blocked} importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'}>
    {children}
  </View>;
}

const styles = StyleSheet.create({ fill: { flex: 1, minHeight: 0 }, hidden: { opacity: 0 } });
