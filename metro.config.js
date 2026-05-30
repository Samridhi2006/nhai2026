const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add .tflite to asset extensions array list
config.resolver.assetExts.push('tflite');
config.resolver.assetExts.push('bin');

module.exports = config;
