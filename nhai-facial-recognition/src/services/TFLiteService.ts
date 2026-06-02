/**
 * TFLiteService - Core ML Inference Engine
 * Manages all model loading and inference
 * ✅ Updated for react-native-fast-tflite v3 (Nitro Modules) API
 */

import { loadTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';
import { Logger } from '../utils/logger';

export class TFLiteService {
  private static instance: TFLiteService;
  private _blazeFaceModel: TensorflowModel | null = null;
  private _mobileFaceNetModel: TensorflowModel | null = null;
  private _blinkDetectorModel: TensorflowModel | null = null;
  private isInitialized = false;
  private _modelsAvailable = false;

  private constructor() {}

  /** True only when both BlazeFace + MobileFaceNet loaded successfully */
  static get modelsAvailable(): boolean {
    return TFLiteService.getInstance()._modelsAvailable;
  }

  static getInstance(): TFLiteService {
    if (!TFLiteService.instance) {
      TFLiteService.instance = new TFLiteService();
    }
    return TFLiteService.instance;
  }

  /**
   * Get the BlazeFace model (for frame processor)
   */
  get blazeFaceModel(): TensorflowModel | null {
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
          require('../../assets/models/blazeface.tflite')
        );
        Logger.info('BlazeFace model loaded successfully.');
      } catch (e) {
        Logger.warn('Failed loading blazeface.tflite asset. Check if file is missing.');
      }

      // 2. Load MobileFaceNet Embedding Model
      try {
        service._mobileFaceNetModel = await loadTensorflowModel(
          require('../../assets/models/mobilefacenet_int8.tflite')
        );
        Logger.info('MobileFaceNet INT8 model loaded successfully.');
      } catch (e) {
        Logger.warn('Failed loading mobilefacenet_int8.tflite asset.');
      }

      // 3. Load Blink Detector Liveness Model
      try {
        service._blinkDetectorModel = await loadTensorflowModel(
          require('../../assets/models/blink_detector.tflite')
        );
        Logger.info('Blink detector model loaded successfully.');
      } catch (e) {
        Logger.warn('Failed loading blink_detector.tflite asset.');
      }

      service.isInitialized = true;
      service._modelsAvailable = !!(service._blazeFaceModel && service._mobileFaceNetModel);
      Logger.info(`TFLite ready. Models available: ${service._modelsAvailable}`);
    } catch (error) {
      Logger.error('Fatal crash inside TFLite initialization context', error);
      service.isInitialized = true;
      service._modelsAvailable = false;
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
   * Detect faces from image file path (for snapshot-based approach)
   * 
   * NOTE: This is a convenience wrapper. For real detection, you need to:
   * 1. Load the image file
   * 2. Decode JPEG/PNG to pixels
   * 3. Resize to 320x320
   * 4. Normalize and convert to ArrayBuffer
   * 5. Call detectFace(buffer)
   * 
   * Since TFLite v3 doesn't expose image loading utilities, we return null
   * and suggest using frame-based detection or implementing image loading.
   */
  static detectFaceFromPath(imagePath: string): FaceDetection | null {
    Logger.warn('detectFaceFromPath: Image loading not implemented. Use frame processor or load pixels manually.');
    // For snapshot-based apps without frameProcessor, you need to:
    // 1. Use a library like @react-native-community/image-editor
    // 2. Or implement native image loading bridge
    // 3. Or use demo/mock detection
    return null;
  }

  /**
   * Extract face embedding (112x112 RGB normalized input)
   * Output: 128-dimensional embedding vector
   * Time: ~150-200ms
   * 
   * ✅ v3 API: Input/output are ArrayBuffers
   */
  static async extractEmbedding(faceCropBuffer: Float32Array | ArrayBuffer): Promise<Float32Array> {
    const service = TFLiteService.getInstance();
    if (!service._mobileFaceNetModel) {
      throw new Error('MobileFaceNet model not loaded');
    }

    try {
      const startTime = Date.now();
      
      // ✅ v3 API JSI requires Uint8Array for all input tensors
      const buffer = faceCropBuffer instanceof Float32Array ? faceCropBuffer.buffer : faceCropBuffer;
      const inputBytes = new Uint8Array(buffer);
      
      // USE ASYNC RUN! runSync has a known JSI bug on some Android devices where it fails to copy the input tensor!
      const output = await service._mobileFaceNetModel.run([inputBytes]);

      // ✅ v3 API returns Uint8Array of raw bytes pointing to the volatile C++ tensor memory. 
      // We MUST read the underlying ArrayBuffer as Float32, and then CLONE it so it doesn't mutate on the next inference!
      const outputBytes = output[0]!;
      const volatileFloats = new Float32Array(outputBytes.buffer, outputBytes.byteOffset, outputBytes.byteLength / 4);
      // The model outputs a batch of 2 embeddings [2, 192]. We only want the first 192 floats (the first image).
      const embedding = new Float32Array(volatileFloats.slice(0, 192)); 

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

function getAnchor(i: number) {
  if (i < 512) {
    const cellIdx = Math.floor(i / 2);
    const y = Math.floor(cellIdx / 16);
    const x = cellIdx % 16;
    return { cx: (x + 0.5) / 16, cy: (y + 0.5) / 16 };
  } else {
    const cellIdx = Math.floor((i - 512) / 6);
    const y = Math.floor(cellIdx / 8);
    const x = cellIdx % 8;
    return { cx: (x + 0.5) / 8, cy: (y + 0.5) / 8 };
  }
}

/**
 * Parse BlazeFace detection output
 */
function parseDetections(
  detections: Float32Array,
  scores: Float32Array
): FaceDetection[] {
  const faces: FaceDetection[] = [];
  const confidenceThreshold = 0.5;

  let maxConfidenceIdx = -1;
  let maxConfidence = confidenceThreshold;

  for (let i = 0; i < 896; i++) {
    const confidence = scores[i];
    if (confidence > maxConfidence) {
      maxConfidence = confidence;
      maxConfidenceIdx = i;
    }
  }

  if (maxConfidenceIdx >= 0) {
    const offset = maxConfidenceIdx * 16;
    const anchor = getAnchor(maxConfidenceIdx);
    
    // BlazeFace outputs raw dx, dy, w, h scaled by 128.0 (input size)
    const raw_dy = detections[offset + 0];
    const raw_dx = detections[offset + 1];
    const raw_dh = detections[offset + 2];
    const raw_dw = detections[offset + 3];

    const cx = raw_dx / 128.0 + anchor.cx;
    const cy = raw_dy / 128.0 + anchor.cy;
    const w = raw_dw / 128.0;
    const h = raw_dh / 128.0;

    const ymin = cy - h / 2;
    const xmin = cx - w / 2;
    const ymax = cy + h / 2;
    const xmax = cx + w / 2;

    // Extract landmarks (6 key points, starting at offset + 4)
    // 0: right eye, 1: left eye, 2: nose, 3: mouth, 4: right ear, 5: left ear
    const faceLandmarks: Landmark[] = [];
    for (let i = 0; i < 6; i++) {
      const lx = detections[offset + 4 + i * 2];
      const ly = detections[offset + 5 + i * 2];
      faceLandmarks.push({
        x: lx / 128.0 + anchor.cx,
        y: ly / 128.0 + anchor.cy,
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
