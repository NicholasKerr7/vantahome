import React from 'react';
import { StyleSheet, View } from 'react-native';
import CinematicSurface from './CinematicSurface';

/** Keep legacy screen backdrops consistent without adding retained-screen animation. */
export default function BackgroundLines() {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <CinematicSurface style={StyleSheet.absoluteFill} />
  </View>;
}
