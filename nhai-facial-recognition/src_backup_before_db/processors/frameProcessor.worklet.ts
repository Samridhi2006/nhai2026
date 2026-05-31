/**
 * frameProcessor.worklet.ts - Real-time Vision Camera Frame Processing
 * ✅ VisionCamera v5 + fast-tflite v3 (Nitro Modules)
 * 
 * WARNING: This file must have 'worklet' directive at the top!
 * It runs on the native thread for real-time performance
 */

'use worklet';

// Minimal, safe frame processor stub to allow compilation and runtime
// Replace with a high-performance native worklet implementation in production.

// Note: Keep this file lightweight and avoid importing modules that
// are not available inside worklets to prevent native-thread errors.

export const frameProcessor = (_frame: any) => {
  'worklet';
  // no-op: placeholder to satisfy Camera prop and TypeScript during development
  return;
};

export function setFaceDetectionCallback(_cb: (detection: any, t: number) => void) {
  // noop placeholder — real implementation should register a runOnJS callback
}

export const frameProcessorWithLiveness = (_frame: any) => {
  'worklet';
  // noop liveness stub
  return;
};
