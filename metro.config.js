// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const _ = require('lodash');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Enable package exports support for react-map-gl v8
config.resolver.unstable_enablePackageExports = true;

// Add web extensions for proper module resolution
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs', 'cjs'];

// Fix for import.meta issues with browser modules
// This helps resolve the "Cannot use import.meta outside a module" error
config.resolver.unstable_conditionNames = _.uniq(
  (config.resolver.unstable_conditionNames || []).concat(['browser', 'require', 'react-native'])
);

module.exports = config;