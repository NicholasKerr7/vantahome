import type { Animated } from 'react-native';

/** Keep shared native-driver transforms in the styling layer rather than the artwork. */
export function createDeviceRotorStyle(rotation: Animated.Value) {
  return { transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] };
}
