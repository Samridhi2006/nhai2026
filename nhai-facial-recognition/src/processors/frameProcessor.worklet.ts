/**
 * frameProcessor.worklet.ts - Real-time Vision Camera Frame Processing
 * ✅ VisionCamera v5 + fast-tflite v3 (Nitro Modules)
 * 
 * WARNING: This file must have 'worklet' directive at the top!
 * It runs on the native thread for real-time performance
 */

'use worklet';

import { Frame, runOnJS } from 'react-native-vision-camera';
import { resize } from 'vision-camera-resize-plugin';
import { TFLiteService, FaceDetection } from '../services/TFLiteService';
import { Logger } from '../utils/logger';

// Frame processor callback - updates UI with detections
let onFaceDetectionCallback: ((detections: FaceDetection | null, frameTime: number) => void) | null = null;

/**
 * Set the callback for face detection results
 * Must be called from main thread before starting camera
 */
export function setFaceDetectionCallback(
  callback: (detections: FaceDetection | null, frameTime: number) => void
) {
  onFaceDetectionCallback = callback;
}

/**
 * Main frame processor for real-time face detection
 * ✅ VisionCamera v5 API: Direct model access (no NitroModules.box())
 * ✅ fast-tflite v3 API: Uses ArrayBuffer, not TypedArray
 * 
 * Input: Raw camera frame (varies by device)
 * Process:
 *   1. Resize to 320x320 RGB (BlazeFace input size)
 *   2. Run inference
 *   3. Parse detections
 *   4. Update UI on main thread
 * 
 * Performance: ~40-50ms per frame @ 30 FPS target
 */
export const frameProcessor = (frame: Frame) => {
  'worklet';

  try {
    const frameStartTime = Date.now();

    // ✅ Step 1: Resize frame to 320x320 RGB for BlazeFace
    // vision-camera-resize-plugin handles this efficiently in native code
    const resized = resize(frame, {
      scale: { width: 320, height: 320 },
      pixelFormat: 'rgb',
      dataType: 'uint8',
    });

    // ✅ CRITICAL: TypedArrays may have byteOffset != 0
    // We MUST slice the buffer to get a clean ArrayBuffer
    // Otherwise fast-tflite v3 will fail or give wrong results
    const inputBuffer = resized.buffer.slice(
      resized.byteOffset,
      resized.byteOffset + resized.byteLength
    );

    // ✅ Step 2: Run BlazeFace detection (v3 API)
    // Input: ArrayBuffer (320x320 RGB, uint8)
    // Output: [detections_buffer, landmarks_buffer]
    const blazeFaceModel = TFLiteService.getInstance().blazeFaceModel;
    if (!blazeFaceModel) {
      console.warn('BlazeFace model not loaded');
      return;
    }

    // ✅ v3 API: Pass ArrayBuffer directly, get ArrayBuffers back
    const outputs = blazeFaceModel.runSync([inputBuffer]);
    const detections = new Float32Array(outputs[0]!);
    const landmarks = new Float32Array(outputs[1]!);

    // ✅ Step 3: Parse detections
    // For MVP: just get highest confidence face
    let bestDetection: FaceDetection | null = null;
    let bestConfidence = 0.5;

    for (let i = 0; i < 896; i++) {
      const offset = i * 16;
      const confidence = detections[offset + 4];

      if (confidence > bestConfidence) {
        bestConfidence = confidence;

        // Extract bounding box
        const ymin = detections[offset + 0];
        const xmin = detections[offset + 1];
        const ymax = detections[offset + 2];
        const xmax = detections[offset + 3];

        // Extract landmarks (6 key points)
        const faceLandmarks = [];
        for (let j = 0; j < 6; j++) {
          const landmarkIdx = i * 6 + j;
          faceLandmarks.push({
            x: landmarks[landmarkIdx * 2],
            y: landmarks[landmarkIdx * 2 + 1],
          });
        }

        bestDetection = {
          boundingBox: {
            xmin,
            ymin,
            width: xmax - xmin,
            height: ymax - ymin,
          },
          landmarks: faceLandmarks,
          confidence: bestConfidence,
        };
      }
    }

    // ✅ Step 4: Update UI on main thread
    const frameTime = Date.now() - frameStartTime;
    if (onFaceDetectionCallback) {
      runOnJS(onFaceDetectionCallback)(bestDetection, frameTime);
    }
  } catch (error) {
    console.error('[frameProcessor] Error:', error);
    // Don't crash the camera - log and continue
  }
};

/**
 * Advanced frame processor with liveness detection
 * TODO: Phase 2 - Add eye blink detection + head movement tracking
 */
export const frameProcessorWithLiveness = (frame: Frame) => {
  'worklet';

  try {
    // TODO: Implement
    // 1. Detect face with BlazeFace
    // 2. Extract eye patches
    // 3. Run blink detector on eye patches
    // 4. Track face position for head movement
    // 5. Combine scores: face confidence + eye blink + head movement
  } catch (error) {
    console.error('[frameProcessorWithLiveness] Error:', error);
  }
};
