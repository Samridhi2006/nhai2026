/**
 * LivenessService - Active Liveness Detection
 * Implements blink-based liveness verification
 */

import { TFLiteService, Landmark } from './TFLiteService';

export interface LivenessState {
  isAlive: boolean;
  blinkCount: number;
  eyeOpenness: number;
  confidence: number;
  debugInfo?: {
    recentEyeStates: EyeState[];
    detectedBlinks: BlinkEvent[];
  };
}

interface EyeState {
  openness: number;
  timestamp: number;
  leftEyeOpen: boolean;
  rightEyeOpen: boolean;
}

interface BlinkEvent {
  startFrame: number;
  endFrame: number;
  duration: number;
  amplitude: number;
}

export class LivenessService {
  private static instance: LivenessService;
  private eyeHistory: EyeState[] = [];
  private detectedBlinks: BlinkEvent[] = [];
  private consecutiveValidBlinks = 0;

  // Configuration
  private readonly EYE_OPENNESS_THRESHOLD = 0.3;
  private readonly MIN_BLINK_DURATION = 100; // ms
  private readonly MAX_BLINK_DURATION = 400; // ms
  private readonly BLINK_DETECTION_WINDOW = 15; // frames @ 30FPS = 500ms
  private readonly MIN_VALID_BLINKS = 2;
  private readonly EYE_OPEN_THRESHOLD = 0.6;

  private constructor() {}

  static getInstance(): LivenessService {
    if (!LivenessService.instance) {
      LivenessService.instance = new LivenessService();
    }
    return LivenessService.instance;
  }

  static async initialize(): Promise<void> {
    // Placeholder for initialization if needed
    console.log('LivenessService initialized');
  }

  /**
   * Process frame for liveness indicators
   * Called every frame from frame processor
   */
  static checkLiveness(
    _faceCropBuffer: ArrayBuffer,
    faceDetection: any
  ): LivenessState {
    const service = LivenessService.getInstance();
    const landmarks = faceDetection.landmarks;

    // If a blink detector model is available use it, otherwise fallback to EAR
    let leftEyeOpenness = 0.5;
    let rightEyeOpenness = 0.5;

    const tflite = TFLiteService.getInstance();
    if (tflite && (tflite as any)._blinkDetectorModel) {
      // Run blink detector on both eyes (native model)
      const eyeRegions = service.extractEyeRegions(landmarks);
      leftEyeOpenness = TFLiteService.detectBlink(eyeRegions.leftEye);
      rightEyeOpenness = TFLiteService.detectBlink(eyeRegions.rightEye);
    } else {
      // Fallback: calculate Eye Aspect Ratio (EAR) from landmarks
      const ear = service.calculateEAR(landmarks);
      leftEyeOpenness = ear;
      rightEyeOpenness = ear;
    }

    const eyeOpenness = (leftEyeOpenness + rightEyeOpenness) / 2;

    // Record state
    const eyeState: EyeState = {
      openness: eyeOpenness,
      timestamp: Date.now(),
      leftEyeOpen: leftEyeOpenness > service.EYE_OPEN_THRESHOLD,
      rightEyeOpen: rightEyeOpenness > service.EYE_OPEN_THRESHOLD,
    };

    service.eyeHistory.push(eyeState);

    // Detect blink pattern
    const blink = service.detectBlinkPattern();
    if (blink) {
      service.detectedBlinks.push(blink);

      // Validate blink characteristics
      if (service.isValidBlink(blink)) {
        service.consecutiveValidBlinks++;
      }
    }

    // Keep only recent history (500ms window @ 30 FPS)
    if (service.eyeHistory.length > service.BLINK_DETECTION_WINDOW) {
      service.eyeHistory.shift();
    }

    // Determine liveness
    const isAlive = service.consecutiveValidBlinks >= service.MIN_VALID_BLINKS;
    const confidence = service.calculateLivenessConfidence();

    return {
      isAlive,
      blinkCount: service.consecutiveValidBlinks,
      eyeOpenness,
      confidence,
      debugInfo: {
        recentEyeStates: service.eyeHistory.slice(-6),
        detectedBlinks: service.detectedBlinks.slice(-5),
      },
    };
  }

  /**
   * Detect blink pattern in eye openness history
   * Pattern: OPEN → CLOSING → CLOSED → OPENING → OPEN
   */
  private detectBlinkPattern(): BlinkEvent | null {
    if (this.eyeHistory.length < 4) return null;

    const recent = this.eyeHistory.slice(-6); // Last 200ms @ 30FPS

    let closingStartIdx = -1;
    let closedStartIdx = -1;
    let openingStartIdx = -1;

    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i - 1];
      const curr = recent[i];

      // Detect transition from open to closing
      if (
        closingStartIdx === -1 &&
        prev.openness > 0.6 &&
        curr.openness < 0.6
      ) {
        closingStartIdx = i - 1;
      }

      // Detect full closure
      if (
        closedStartIdx === -1 &&
        closingStartIdx !== -1 &&
        curr.openness < this.EYE_OPENNESS_THRESHOLD
      ) {
        closedStartIdx = i;
      }

      // Detect transition from closed to opening
      if (
        openingStartIdx === -1 &&
        closedStartIdx !== -1 &&
        prev.openness < this.EYE_OPENNESS_THRESHOLD &&
        curr.openness > this.EYE_OPENNESS_THRESHOLD
      ) {
        openingStartIdx = i - 1;
      }

      // Complete blink detected
      if (openingStartIdx !== -1 && closingStartIdx !== -1) {
        const startTime = recent[closingStartIdx].timestamp;
        const endTime = recent[i].timestamp;
        const duration = endTime - startTime;

        // Calculate amplitude (max closure)
        const closurePortion = recent.slice(closedStartIdx, i);
        const minOpenness = Math.min(...closurePortion.map(s => s.openness));
        const amplitude = 1.0 - minOpenness;

        return {
          startFrame: closingStartIdx,
          endFrame: i,
          duration,
          amplitude,
        };
      }
    }

    return null;
  }

  /**
   * Validate blink characteristics to prevent spoofing
   */
  private isValidBlink(blink: BlinkEvent): boolean {
    const isValidDuration =
      blink.duration >= this.MIN_BLINK_DURATION &&
      blink.duration <= this.MAX_BLINK_DURATION;

    const isValidAmplitude = blink.amplitude > 0.6; // At least 60% eye closure

    return isValidDuration && isValidAmplitude;
  }

  /**
   * Calculate overall liveness confidence [0, 1]
   */
  private calculateLivenessConfidence(): number {
    if (this.detectedBlinks.length === 0) return 0;

    let score = 0;

    // Blink count (0-40 points)
    score += Math.min((this.consecutiveValidBlinks / 2) * 40, 40);

    // Blink quality (0-30 points)
    const avgAmplitude =
      this.detectedBlinks.reduce((sum, b) => sum + b.amplitude, 0) /
      this.detectedBlinks.length;
    score += avgAmplitude * 30;

    // Blink timing consistency (0-30 points)
    const intervals = this.calculateBlinkIntervals();
    const consistencyScore = this.calculateConsistency(intervals);
    score += consistencyScore * 30;

    return Math.min(score / 100, 1.0);
  }

  private calculateBlinkIntervals(): number[] {
    const intervals = [];
    for (let i = 1; i < this.detectedBlinks.length; i++) {
      const interval =
        this.detectedBlinks[i].startFrame -
        this.detectedBlinks[i - 1].endFrame;
      intervals.push(interval);
    }
    return intervals;
  }

  private calculateConsistency(intervals: number[]): number {
    if (intervals.length === 0) return 0;

    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance =
      intervals.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) /
      intervals.length;
    const stdDev = Math.sqrt(variance);

    // Lower std dev = more consistent
    // Use exponential decay for consistency score
    const consistency = Math.exp(-stdDev / (mean || 1));
    return consistency;
  }

  /**
   * Extract eye region crops from face landmarks
   * BlazeFace provides 6 landmarks: [right_eye, left_eye, nose, mouth, right_ear, left_ear]
   */
  private extractEyeRegions(
    landmarks: Landmark[]
  ): { leftEye: ArrayBuffer; rightEye: ArrayBuffer } {
    const rightEye = landmarks[0];
    const leftEye = landmarks[1];

    return {
      leftEye: this.cropEyePatch(leftEye, 64),
      rightEye: this.cropEyePatch(rightEye, 64),
    };
  }

  /**
   * Crop eye patch - simplified version
   * In production, implement with native image processing
   */
  private cropEyePatch(
    _eyePosition: Landmark,
    size: number
  ): ArrayBuffer {
    // Placeholder - actual implementation would:
    // 1. Denormalize coordinates to pixel space
    // 2. Extract region from frame
    // 3. Resize to 64x64
    // 4. Normalize to [-1, 1]
    // 5. Convert to grayscale
    // 6. Return as ArrayBuffer

    return new ArrayBuffer(size * size);
  }

  /**
   * Calculate Eye Aspect Ratio (EAR) from available landmarks.
   * This is a lightweight geometric fallback when a blink model is not present.
   * EAR ≈ (vertical_dist1 + vertical_dist2) / (2 * horizontal_dist)
   * We accept multiple landmark layouts and fall back to a neutral value (0.5).
   */
  private calculateEAR(landmarks: Landmark[] | any): number {
    try {
      // If landmarks is an array of points (x,y), try to map positions
      if (Array.isArray(landmarks) && landmarks.length >= 4) {
        const p1 = landmarks[0]; // right eye / left corner
        const p4 = landmarks[1]; // left eye / right corner

        // vertical estimates - try nearby points if present
        const v1 = landmarks[2];
        const v2 = landmarks[3];

        if (p1 && p4 && v1 && v2 && isFinite(p1.x) && isFinite(p4.x) && isFinite(v1.y) && isFinite(v2.y)) {
          const horizontal = Math.hypot(p1.x - p4.x, p1.y - p4.y);
          const vertical1 = Math.hypot(v1.x - v2.x, v1.y - v2.y);

          if (horizontal <= 0) return 0.5;

          // EAR raw value
          const ear = vertical1 / (2.0 * horizontal);
          // Clamp and normalize to [0,1]
          return Math.max(0, Math.min(1, ear));
        }
      }
    } catch (e) {
      // ignore and fallback
    }

    // Neutral fallback
    return 0.5;
  }

  /**
   * Reset state (call for new attempt)
   */
  static reset(): void {
    const service = LivenessService.getInstance();
    service.eyeHistory = [];
    service.detectedBlinks = [];
    service.consecutiveValidBlinks = 0;
  }
}
