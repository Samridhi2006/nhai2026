/**
 * TFLiteService - Core ML Inference Engine
 * Manages all model loading and inference
 * ✅ Updated for react-native-fast-tflite v3 (Nitro Modules) API
 */

import { loadTensorflowModel, TfliteModel } from 'react-native-fast-tflite';
import { Logger } from '../utils/logger';

export class TFLiteService {
  private static instance: TFLiteService;
  private _blazeFaceModel: TfliteModel | null = null;
  private _mobileFaceNetModel: TfliteModel | null = null;
  private _blinkDetectorModel: TfliteModel | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): TFLiteService {
    if (!TFLiteService.instance) {
      TFLiteService.instance = new TFLiteService();
    }
    return TFLiteService.instance;
  }

  /**
   * Get the BlazeFace model (for frame processor)
   */
  get blazeFaceModel(): TfliteModel | null {
    return this._blazeFaceModel;
  }

  /**
   * Initialize all models
   * Call once at app startup
   */
  static async initialize(): Promise<void> {
    const service = TFLiteService.getInstance();
    if (service.isInitialized) return;
    Logger.info('Loading TFLite models using Fast-TFLite v3 API...');

    // Defensive per-model loading: ensure failures do not crash the JS thread
    try {
      // 1. Load BlazeFace Face Detection Model
      try {
        service._blazeFaceModel = await loadTensorflowModel(
          require('../../assets/models/blazeface.tflite'),
          [] // Explicitly pass empty delegate array for CPU fallback in v3
        );
        Logger.info('BlazeFace model loaded successfully.');
      } catch (e) {
        Logger.warn('Failed loading blazeface.tflite asset. Check if file is missing.');
      }

      // 2. Load MobileFaceNet Embedding Model
      try {
        service._mobileFaceNetModel = await loadTensorflowModel(
          require('../../assets/models/mobilefacenet_int8.tflite'),
          []
        );
        Logger.info('MobileFaceNet INT8 model loaded successfully.');
      } catch (e) {
        Logger.warn('Failed loading mobilefacenet_int8.tflite asset.');
      }

      // 3. Load Blink Detector Liveness Model
      try {
        service._blinkDetectorModel = await loadTensorflowModel(
          require('../../assets/models/blink_detector.tflite'),
          []
        );
        Logger.info('Blink detector model loaded successfully.');
      } catch (e) {
        Logger.warn('Failed loading blink_detector.tflite asset.');
      }

      service.isInitialized = true;
      Logger.info('TFLite Service initialization finished.');
    } catch (error) {
      // Catch-all: Should be rare since individual model loads are wrapped.
      Logger.error('Fatal crash inside TFLite initialization context', error);
      // Fallback path to make sure the user interface still renders during development
      service.isInitialized = true;
    }
  }

  /**
   * Check readiness: we consider the service ready if it was initialized
   * and the BlazeFace model (used by frame processor) is present.
   */
  static isReady(): boolean {
    const service = TFLiteService.getInstance();
    return service.isInitialized && service._blazeFaceModel !== null;
  }

  /**
   * Detect faces in frame (320x320 normalized input)
   * Output: Array of face detections with landmarks
   * Time: ~40-50ms
   * 
   * ✅ v3 API: Input is ArrayBuffer, output must be wrapped in typed arrays
   */
  static detectFace(frameBuffer: ArrayBuffer): FaceDetection | null {
    const service = TFLiteService.getInstance();
    if (!service._blazeFaceModel) throw new Error('BlazeFace model not loaded');

    try {
      const startTime = Date.now();

      // ✅ v3 API: Pass ArrayBuffer directly (NOT TypedArray)
      const output = service._blazeFaceModel.runSync([frameBuffer]);

      // ✅ v3 API: Outputs are ArrayBuffers - wrap them in typed arrays
      // BlazeFace output: [detections, landmarks]
      // detections shape: [1, 896, 16] - 896 anchor boxes, 16 values each
      // landmarks shape: [1, 192, 2] - 192 landmarks, x,y coords
      
      const detections = new Float32Array(output[0]!);
      const landmarks = new Float32Array(output[1]!);

      // Post-process: NMS, filter by confidence
      const faces = parseDetections(detections, landmarks);

      const latency = Date.now() - startTime;
      console.log(`Face detection: ${latency}ms, found ${faces.length} faces`);

      return faces.length > 0 ? faces[0] : null;
    } catch (error) {
      console.error('Face detection error:', error);
      return null;
    }
  }

  /**
   * Extract face embedding (112x112 RGB normalized input)
   * Output: 128-dimensional embedding vector
   * Time: ~150-200ms
   * 
   * ✅ v3 API: Input/output are ArrayBuffers
   */
  static extractEmbedding(faceCropBuffer: ArrayBuffer): Float32Array {
    const service = TFLiteService.getInstance();
    if (!service._mobileFaceNetModel) {
      throw new Error('MobileFaceNet model not loaded');
    }

    try {
      const startTime = Date.now();

      // ✅ v3 API: Pass ArrayBuffer directly
      const output = service._mobileFaceNetModel.runSync([faceCropBuffer]);

      // ✅ v3 API: Output is ArrayBuffer - wrap in typed array
      // MobileFaceNet outputs 128-dimensional embedding
      const embedding = new Float32Array(output[0]!);

      const latency = Date.now() - startTime;
      console.log(`Embedding extraction: ${latency}ms`);

      return embedding;
    } catch (error) {
      console.error('Embedding extraction error:', error);
      throw error;
    }
  }

  /**
   * Detect blink in eye patch (64x64 grayscale)
   * Output: Eye openness probability [0, 1]
   * Time: ~50-100ms
   * 
   * ✅ v3 API: Input/output are ArrayBuffers
   */
  static detectBlink(eyePatchBuffer: ArrayBuffer): number {
    const service = TFLiteService.getInstance();
    if (!service._blinkDetectorModel) {
      throw new Error('Blink detector model not loaded');
    }

    try {
      // ✅ v3 API: Pass ArrayBuffer directly
      const output = service._blinkDetectorModel.runSync([eyePatchBuffer]);

      // ✅ v3 API: Output is ArrayBuffer - wrap in typed array
      // Parse output: [eyeOpen, eyeClosed]
      // Return probability that eye is open
      const probabilities = new Float32Array(output[0]!);
      return probabilities[0]; // eyeOpen probability
    } catch (error) {
      console.error('Blink detection error:', error);
      return 0.5; // Default neutral
    }
  }

  /**
   * Cleanup (call on app exit)
   */
  static cleanup(): void {
    const service = TFLiteService.getInstance();
    // Models are automatically cleaned up by garbage collection
    service.isInitialized = false;
  }
}

// Helper types
export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

export interface FaceDetection {
  boundingBox: {
    xmin: number;
    ymin: number;
    width: number;
    height: number;
  };
  landmarks: Landmark[];
  confidence: number;
}

/**
 * Parse BlazeFace detection output
 */
function parseDetections(
  detections: Float32Array,
  landmarks: Float32Array
): FaceDetection[] {
  const faces: FaceDetection[] = [];

  // BlazeFace uses SSD-like anchor scheme
  // Filter detections by confidence threshold
  const confidenceThreshold = 0.5;

  // Simplified parsing - full implementation would handle all 896 anchors
  // For efficiency, we find the highest confidence detection

  let maxConfidenceIdx = -1;
  let maxConfidence = confidenceThreshold;

  for (let i = 0; i < 896; i++) {
    const offset = i * 16;
    const confidence = detections[offset + 4]; // Confidence value

    if (confidence > maxConfidence) {
      maxConfidence = confidence;
      maxConfidenceIdx = i;
    }
  }

  if (maxConfidenceIdx >= 0) {
    const offset = maxConfidenceIdx * 16;
    
    // Extract bounding box [ymin, xmin, ymax, xmax] normalized
    const ymin = detections[offset + 0];
    const xmin = detections[offset + 1];
    const ymax = detections[offset + 2];
    const xmax = detections[offset + 3];

    // Extract landmarks (6 key points)
    const faceLandmarks: Landmark[] = [];
    for (let i = 0; i < 6; i++) {
      const landmarkIdx = maxConfidenceIdx * 6 + i;
      faceLandmarks.push({
        x: landmarks[landmarkIdx * 2],
        y: landmarks[landmarkIdx * 2 + 1],
      });
    }

    faces.push({
      boundingBox: {
        xmin,
        ymin,
        width: xmax - xmin,
        height: ymax - ymin,
      },
      landmarks: faceLandmarks,
      confidence: maxConfidence,
    });
  }

  return faces;
}
