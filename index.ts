import 'react-native-url-polyfill/auto';
import { Buffer } from 'buffer';
import process from 'process';
import { registerRootComponent } from 'expo';

import App from './App';

const globalForMqtt = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
  process?: typeof process;
};

if (!globalForMqtt.Buffer) {
  globalForMqtt.Buffer = Buffer;
}
if (!globalForMqtt.process) {
  globalForMqtt.process = process;
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
