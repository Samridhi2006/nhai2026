// mock stub for react-native-quick-crypto
// This prevents the native module crash since QuickBase64 isn't linked
module.exports = {
  randomBytes: (size) => {
    const buf = new Uint8Array(size);
    for (let i = 0; i < size; i++) buf[i] = Math.floor(Math.random() * 256);
    return buf;
  },
  scryptSync: () => new Uint8Array(32),
  createCipheriv: () => ({
    update: (data) => data,
    final: () => '',
    getAuthTag: () => new Uint8Array(16),
  }),
  createDecipheriv: () => ({
    setAuthTag: () => {},
    update: (data) => data,
    final: () => '',
  }),
};
