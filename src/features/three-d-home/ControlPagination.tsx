import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { controlStyles as styles } from './deviceControlsStyles';
import PageScrollRail from '../../components/PageScrollRail';

/** Fixed footer navigation makes every setting reachable without vertical scrolling. */
export function ControlPagination({ page, count, onChange, resetKey }: { page: number; count: number; onChange: (page: number) => void; resetKey?: string | number }) {
  return <View style={styles.footer}>
    <Pressable accessibilityRole="button" accessibilityLabel="Previous controls page" disabled={page === 0}
      accessibilityState={{ disabled: page === 0 }} onPress={() => onChange(page - 1)} style={[styles.button, page === 0 && styles.disabled]}>
      <Text style={styles.label}>Previous</Text>
    </Pressable>
    <PageScrollRail page={page} count={count} onChange={onChange} label="controls" resetKey={resetKey} />
    <Pressable accessibilityRole="button" accessibilityLabel="Next controls page" disabled={page >= count - 1}
      accessibilityState={{ disabled: page >= count - 1 }} onPress={() => onChange(page + 1)} style={[styles.button, page >= count - 1 && styles.disabled]}>
      <Text style={styles.label}>Next</Text>
    </Pressable>
  </View>;
}
