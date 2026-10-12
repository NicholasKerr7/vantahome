import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

// Keep the system's matching still until React has laid out its own local poster.
// Web and environments without a native splash simply use the React surface.
if (Platform.OS !== 'web') void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** A poster decode failure must never trap someone behind the operating-system splash. */
export function hideNativeLaunch(): void {
  if (Platform.OS !== 'web') void SplashScreen.hideAsync().catch(() => undefined);
}
