const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;
const zustandMiddlewareCommonJs = require.resolve("zustand/middleware");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "zustand/middleware") {
    // Zustand's ESM middleware currently emits import.meta.env, but Expo's web
    // development bundle is loaded as a classic script. Use the equivalent
    // CommonJS build so the app can mount instead of failing during parsing.
    return context.resolveRequest(
      context,
      zustandMiddlewareCommonJs,
      platform,
    );
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
