import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

/** Keep a quiet local fallback when the property is mounted outside the root arrival coordinator. */
export default function PropertyArrival({ active = true }: { active?: boolean }) {
  return <View style={styles.root} testID="property-arrival" accessibilityElementsHidden={!active}>
    <Image source={require('../../../assets/brand/motion/vantahome-arrival-hold.png')} style={styles.poster} resizeMode="contain" accessible={false} />
    <View style={styles.copy} accessibilityLiveRegion="polite">
      <Text style={styles.title}>Opening your property…</Text>
      <Text style={styles.description}>Your controls are ready while the view opens.</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: '#050612', justifyContent: 'flex-end' },
  poster: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  copy: { padding: 24, gap: 8, backgroundColor: '#050612' },
  title: { color: '#F5EEFF', fontSize: 18, textAlign: 'center' },
  description: { color: '#CEC2E0', fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
