const APP_IDENTITIES = Object.freeze({
  production: Object.freeze({
    variant: "production",
    scheme: "vantahome",
    bundleIdentifier: "com.anonymous.vantahome",
    displayName: "VantaHome",
  }),
  preview: Object.freeze({
    variant: "preview",
    scheme: "vantahome-preview",
    bundleIdentifier: "com.anonymous.vantahome.preview",
    displayName: "VantaHome Preview",
  }),
});

/** Share the explicit native identity between Metro and packaging checks. */
function resolveAppVariant(configuredVariant) {
  const variant = configuredVariant === undefined || configuredVariant === ""
    ? "production"
    : configuredVariant;
  if (variant !== "production" && variant !== "preview") {
    throw new Error("EXPO_PUBLIC_APP_VARIANT must be production or preview.");
  }
  return APP_IDENTITIES[variant];
}

module.exports = { resolveAppVariant };
