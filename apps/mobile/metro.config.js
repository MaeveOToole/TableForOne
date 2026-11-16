const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, '../..');
// Resolve the local workspace directly, including after moving the checkout on Windows.
config.watchFolders = [
  ...new Set([
    ...(config.watchFolders || []),
    path.join(workspaceRoot, 'packages/contracts'),
  ]),
];
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@meal/contracts': path.join(workspaceRoot, 'packages/contracts'),
};
module.exports = config;
