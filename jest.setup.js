// Required by react-native-gesture-handler (and libraries depending on it).
require("react-native-gesture-handler/jestSetup");

// Silence Animated warnings in Jest environment (RN 0.81+ path).
jest.mock("react-native/src/private/animated/NativeAnimatedHelper");

// Make Reanimated deterministic in Jest and expose Animated.FlatList.
jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  const { FlatList } = require("react-native");
  const Animated = Reanimated.default ?? Reanimated;
  Animated.FlatList = FlatList;
  Reanimated.default = Animated;
  Reanimated.FlatList = FlatList;
  return Reanimated;
});

// Replace LinearGradient with a plain View in tests.
jest.mock("expo-linear-gradient", () => {
  const { View } = require("react-native");
  return { LinearGradient: View };
});

jest.mock("@react-native-community/slider", () => {
  const { View } = require("react-native");
  return View;
});

// Extend Jest with @testing-library/jest-native matchers.
require("@testing-library/jest-native/extend-expect");

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
