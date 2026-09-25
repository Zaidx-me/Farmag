const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the monorepo so pnpm-linked dependencies stay in Metro's file map.
config.watchFolders = [workspaceRoot];

// expo-sqlite's web worker imports a raw .wasm file; without this Metro tries to
// resolve it as JS and the web export fails.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];
}

module.exports = withNativeWind(config, { input: './global.css' });

