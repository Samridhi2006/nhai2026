const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add .tflite and .bin as supported asset extensions
config.resolver.assetExts.push('tflite', 'bin');

// Redirect react-native-quick-crypto to a safe JS mock
// (QuickBase64 native module is not linked in this build)
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'react-native-quick-crypto': path.resolve(__dirname, 'mocks/react-native-quick-crypto.js'),
};

module.exports = config;
