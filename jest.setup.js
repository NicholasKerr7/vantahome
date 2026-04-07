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

jest.mock("expo-av", () => {
  class Recording {
    prepareToRecordAsync = jest.fn(async () => undefined);
    startAsync = jest.fn(async () => undefined);
    stopAndUnloadAsync = jest.fn(async () => undefined);
    setOnRecordingStatusUpdate = jest.fn();
    setProgressUpdateInterval = jest.fn();
  }
  return {
    Audio: {
      requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
      setAudioModeAsync: jest.fn(async () => undefined),
      Recording,
      RecordingOptionsPresets: { LOW_QUALITY: {} },
    },
    InterruptionModeIOS: { MixWithOthers: "MixWithOthers" },
    InterruptionModeAndroid: { DuckOthers: "DuckOthers" },
  };
});

jest.mock("expo-video", () => {
  const React = require("react");
  const { View } = require("react-native");
  class MockVideoView extends React.Component {
    enterFullscreen = jest.fn();
    exitFullscreen = jest.fn();
    startPictureInPicture = jest.fn();
    stopPictureInPicture = jest.fn();
    render() {
      return React.createElement(View, this.props);
    }
  }
  return {
    VideoView: MockVideoView,
    useVideoPlayer: jest.fn(() => ({
      play: jest.fn(),
      pause: jest.fn(),
      loop: false,
      muted: false,
    })),
    isPictureInPictureSupported: jest.fn(() => false),
  };
});

// Extend Jest with @testing-library/jest-native matchers.
require("@testing-library/jest-native/extend-expect");

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
