const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the monorepo so pnpm-linked dependencies stay in Metro's file map.
config.watchFolders = [workspaceRoot];

module.exports = withNativeWind(config, { input: './global.css' });

