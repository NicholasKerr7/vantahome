import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { theme } from '../../theme/theme';
import ArrivalBackdrop from './ArrivalBackdrop';
import VerificationArchitecture from './VerificationArchitecture';

type Props = { active?: boolean };

/** Continue the arrival inside the scene while the surrounding verified controls remain available. */
export default function PropertyArrival({ active = true }: Props) {
  const { fontScale, height } = useWindowDimensions();
  return <View style={styles.root} testID="property-arrival">
    <ArrivalBackdrop />
    <ScrollView
      style={styles.fill}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      bounces={false}
      overScrollMode="never"
      decelerationRate="normal"
    >
      {fontScale < 1.35 && <View style={[styles.artwork, height < 700 && styles.artworkCompact]}>
        <VerificationArchitecture active={active} />
      </View>}
      <View style={styles.status} accessibilityLiveRegion="polite">
        <Text style={styles.title} accessibilityRole="header">Opening your property…</Text>
        <Text style={styles.description}>Your controls are ready while the view opens.</Text>
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.bg0 },
  fill: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, gap: 8 },
  artwork: { width: '100%', maxWidth: 260, height: 170 },
  artworkCompact: { maxWidth: 192, height: 126 },
  status: { width: '100%', maxWidth: 320, gap: 8 },
  title: { color: theme.colors.text, fontSize: 20, lineHeight: 26, fontWeight: '500', textAlign: 'center', letterSpacing: -0.4 },
  description: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
