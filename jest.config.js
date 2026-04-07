const os = require("os");
const path = require("path");

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  roots: ["<rootDir>/src"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testMatch: ["**/?(*.)+(spec|test).[tj]s?(x)"],
  cacheDirectory: path.join(os.tmpdir(), "jest-vantahome"),
  watchman: false,
  modulePathIgnorePatterns: [
    "<rootDir>/ios/",
    "<rootDir>/docs/",
    "<rootDir>/.expo/",
    "<rootDir>/.device-crash/",
    "<rootDir>/vantahome/",
  ],
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/ios/",
    "<rootDir>/docs/",
    "<rootDir>/.expo/",
    "<rootDir>/.device-crash/",
  ],
  watchPathIgnorePatterns: [
    "<rootDir>/ios/",
    "<rootDir>/docs/",
    "<rootDir>/.expo/",
    "<rootDir>/.device-crash/",
    "<rootDir>/vantahome/",
  ],
};
