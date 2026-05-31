import { Buffer } from 'buffer';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

if (typeof process === 'undefined') {
  (global as any).process = {};
}

if (typeof process.version === 'undefined') {
  (process as any).version = 'v10.16.0';
}

if (typeof process.browser === 'undefined') {
  (process as any).browser = true;
}
