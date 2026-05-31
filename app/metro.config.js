// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite's web (wa-sqlite) worker imports a .wasm binary - Metro must treat
// it as a bundled asset or the web build can't resolve it.
config.resolver.assetExts.push("wasm");

module.exports = withNativeWind(config, { input: "./global.css" });
