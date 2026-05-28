const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add .tflite and .bin as supported asset extensions
config.resolver.assetExts.push('tflite', 'bin');

module.exports = config;
