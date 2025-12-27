/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
  modulePathIgnorePatterns: ['<rootDir>/vantahome/'],
  watchPathIgnorePatterns: ['<rootDir>/vantahome/'],
};
