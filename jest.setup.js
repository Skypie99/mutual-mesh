// Jest setup — runs before each test file (see jest.config.js setupFiles).

// AsyncStorage's NativeModule is null under Jest, so any screen that imports
// @react-native-async-storage/async-storage (e.g. ProfileScreen) crashes the
// whole suite on load. The library ships an official Jest mock — wire it
// globally here. (This file is .js, not linted by the .ts/.tsx ESLint config,
// so the require() is fine.)
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
