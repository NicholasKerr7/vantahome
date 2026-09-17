const expoPreset = require("jest-expo/jest-preset");

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // The patched URI decoder is ESM; transform it just as Metro does while
  // retaining every other exclusion supplied by the Expo preset.
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map((pattern) =>
    pattern.replace("/node_modules/", "/node_modules/(?!decode-uri-component(?:/|$))"),
  ),
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testMatch: ["**/?(*.)+(spec|test).[tj]s?(x)"],
  modulePathIgnorePatterns: ["<rootDir>/vantahome/", "<rootDir>/dist/", "<rootDir>/voice-linking-dist/", "<rootDir>/voice-linking-cloudflare/"],
  watchPathIgnorePatterns: ["<rootDir>/vantahome/"],
};
