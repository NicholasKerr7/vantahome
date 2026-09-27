module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // One compiler serves Reanimated and Filament's nested render worklets.
    plugins: [["react-native-worklets/plugin", { processNestedWorklets: true }]],
  };
};
