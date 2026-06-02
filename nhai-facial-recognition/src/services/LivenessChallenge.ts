/**
 * LivenessChallenge.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Geometric Challenge-Response Anti-Spoofing Engine
 *
 * OVERVIEW
 * --------
 * Prevents presentation attacks (printed photos, replayed videos) by issuing
 * a random head-movement challenge before face recognition runs.
 *
 * APPROACH — purely geometric, no extra AI model required
 * -------------------------------------------------------
 * We derive 3-D head pose from 2-D facial landmark positions using the same
 * BlazeFace/MediaPipe landmark coordinates your existing pipeline already
 * produces.  Two ratios are computed:
 *
 *   YAW  (Left / Right rotation)
 *        = (nose_x - face_left_x) / face_width  — [0..1]
 *          Centre ≈ 0.5  |  Left turn → < 0.35  |  Right turn → > 0.65
 *
 *   PITCH (Up / Down tilt)
 *        = (nose_y - eye_centre_y) / face_height — [0..1]
 *          Neutral ≈ 0.4  |  Chin-up  → < 0.30  |  Chin-down → > 0.55
 *
 * These are calibration-free ratios that work across all face sizes because
 * we normalise by bounding-box dimensions, not pixel distances.
 *
 * THRESHOLD TUNING GUIDE
 * ----------------------
 *   YAW_LEFT_MAX  (0.35)  — lower  = stricter left check  (0.28 = very strict)
 *   YAW_RIGHT_MIN (0.65)  — higher = stricter right check (0.72 = very strict)
 *   PITCH_UP_MAX  (0.30)  — lower  = stricter upward tilt  (0.25 = very strict)
 *   HOLD_FRAMES   (8)     — consecutive frames needed; raise to reduce flicker
 *
 * HOW TO PLUG INTO THE CAMERA LOOP
 * ----------------------------------
 *   1. Create a challenge:   const ch = LivenessChallenge.newChallenge();
 *   2. Display ch.prompt to the user
 *   3. Each camera frame:    LivenessChallenge.evaluateFrame(ch, landmarks)
 *   4. Check ch.passed       → if true, hand frame to TFLiteService
 *   5. Honour ch.expired     → if true, show timeout and request new challenge
 */

// ─── Public Types ─────────────────────────────────────────────────────────────

export type ChallengeDirection = 'LEFT' | 'RIGHT' | 'UP';

export interface FaceLandmarks {
  /** Nose tip pixel position */
  noseTip:    { x: number; y: number };
  /** Left edge of face bounding box (furthest left pixel) */
  faceLeft:   { x: number; y: number };
  /** Right edge of face bounding box */
  faceRight:  { x: number; y: number };
  /** Top of face bounding box */
  faceTop:    { x: number; y: number };
  /** Bottom of face bounding box (chin) */
  faceBottom: { x: number; y: number };
  /** Midpoint between both eyes */
  eyeCentre:  { x: number; y: number };
}

export interface LivenessChallengState {
  direction:     ChallengeDirection;
  prompt:        string;            // Shown to the user in the UI
  passed:        boolean;
  expired:       boolean;
  holdCount:     number;            // Consecutive frames above threshold
  startTime:     number;            // ms epoch — for timeout
  yawRatio:      number;            // Last measured yaw  [0..1]
  pitchRatio:    number;            // Last measured pitch [0..1]
}

// ─── Threshold Constants (tweak here) ────────────────────────────────────────

/** Yaw ratio: face turned enough to the LEFT when below this value */
const YAW_LEFT_MAX   = 0.38;   // decrease for stricter left detection

/** Yaw ratio: face turned enough to the RIGHT when above this value */
const YAW_RIGHT_MIN  = 0.62;   // increase for stricter right detection

/** Pitch ratio: face tilted enough UPWARD when above this value */
const PITCH_UP_MIN   = 0.48;   



/** Consecutive "in-threshold" frames before ChallengePassed = true */
const HOLD_FRAMES    = 8;

/** Milliseconds before the challenge expires and must be regenerated */
const TIMEOUT_MS     = 10_000;

// ─── Challenge Directions & Prompts ──────────────────────────────────────────

const DIRECTIONS: ChallengeDirection[] = ['LEFT', 'RIGHT', 'UP'];

const PROMPTS: Record<ChallengeDirection, string> = {
  LEFT:  'Turn your head slightly to the Left',
  RIGHT: 'Turn your head slightly to the Right',
  UP:    'Tilt your head slightly Up',
};

// ─── Core Engine ─────────────────────────────────────────────────────────────

export const LivenessChallenge = {
  /**
   * Create a new random challenge.
   * Call once when biometric scan initiates.
   */
  newChallenge(): LivenessChallengState {
    const direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
    return {
      direction,
      prompt:    PROMPTS[direction],
      passed:    false,
      expired:   false,
      holdCount: 0,
      startTime: Date.now(),
      yawRatio:  0.5,
      pitchRatio: 0.4,
    };
  },

  /**
   * Evaluate one camera frame against the active challenge.
   *
   * @param state     - The current challenge state (mutated in-place)
   * @param landmarks - Face landmark positions for this frame
   * @returns Updated state (same object reference)
   *
   * After calling this:
   *   • if state.passed  → hand the frame to TFLiteService.extractEmbedding()
   *   • if state.expired → show "timeout" UI and call newChallenge() again
   */
  evaluateFrame(
    state: LivenessChallengState,
    landmarks: FaceLandmarks
  ): LivenessChallengState {
    // Already resolved — nothing to do
    if (state.passed || state.expired) return state;

    // Timeout check
    if (Date.now() - state.startTime > TIMEOUT_MS) {
      state.expired = true;
      return state;
    }

    // ── Compute geometric ratios ───────────────────────────────────────────
    const faceWidth  = landmarks.faceRight.x  - landmarks.faceLeft.x;
    const faceHeight = landmarks.faceBottom.y - landmarks.faceTop.y;

    if (faceWidth <= 0 || faceHeight <= 0) return state; // invalid frame

    // Normalised nose position within face bounding box
    const yawRatio   = (landmarks.noseTip.x - landmarks.faceLeft.x) / faceWidth;
    const pitchRatio = (landmarks.noseTip.y - landmarks.eyeCentre.y) / faceHeight;

    state.yawRatio   = yawRatio;
    state.pitchRatio = pitchRatio;

    // ── Check threshold for the required direction ─────────────────────────
    let inThreshold = false;

    switch (state.direction) {
      case 'LEFT':
        inThreshold = yawRatio < YAW_LEFT_MAX;
        break;
      case 'RIGHT':
        inThreshold = yawRatio > YAW_RIGHT_MIN;
        break;
      case 'UP':
        inThreshold = pitchRatio < PITCH_UP_MAX;
        break;
    }

    // ── Accumulate or reset hold counter ──────────────────────────────────
    if (inThreshold) {
      state.holdCount += 1;
      if (state.holdCount >= HOLD_FRAMES) {
        state.passed = true;
      }
    } else {
      // Decay slowly — don't punish for a single bad frame
      state.holdCount = Math.max(0, state.holdCount - 1);
    }

    return state;
  },

  /**
   * Build a FaceLandmarks object from raw BlazeFace / MediaPipe output.
   *
   * BlazeFace output[1] (landmark Float32Array) layout per detection:
   *   index 0,1 = right eye   x,y
   *   index 2,3 = left eye    x,y
   *   index 4,5 = nose tip    x,y
   *   index 6,7 = mouth       x,y
   *   index 8,9 = right ear   x,y
   *   index 10,11= left ear   x,y
   *
   * Bounding box from output[0]:
   *   index 0 = ymin, 1 = xmin, 2 = ymax, 3 = xmax  (normalised [0..1])
   *   Scale by frameWidth / frameHeight to get pixels.
   */
  fromBlazeFaceOutput(
    detections: Float32Array,
    landmarks: Float32Array,
    detectionIdx: number,
    frameWidth: number,
    frameHeight: number
  ): FaceLandmarks {
    const dOff = detectionIdx * 16;
    const lOff = detectionIdx * 12;

    const ymin = detections[dOff + 0] * frameHeight;
    const xmin = detections[dOff + 1] * frameWidth;
    const ymax = detections[dOff + 2] * frameHeight;
    const xmax = detections[dOff + 3] * frameWidth;

    // Right eye (0,1) and left eye (2,3) → eye centre
    const reX = landmarks[lOff + 0] * frameWidth;
    const reY = landmarks[lOff + 1] * frameHeight;
    const leX = landmarks[lOff + 2] * frameWidth;
    const leY = landmarks[lOff + 3] * frameHeight;

    // Nose tip (4,5)
    const nX = landmarks[lOff + 4] * frameWidth;
    const nY = landmarks[lOff + 5] * frameHeight;

    return {
      noseTip:    { x: nX, y: nY },
      faceLeft:   { x: xmin, y: (ymin + ymax) / 2 },
      faceRight:  { x: xmax, y: (ymin + ymax) / 2 },
      faceTop:    { x: (xmin + xmax) / 2, y: ymin },
      faceBottom: { x: (xmin + xmax) / 2, y: ymax },
      eyeCentre:  { x: (reX + leX) / 2, y: (reY + leY) / 2 },
    };
  },

  /**
   * Synthesise a FaceLandmarks object from the existing FaceDetection type
   * that TFLiteService.detectFace() already returns.
   * Landmark order: 0=right eye, 1=left eye, 2=nose, 3=mouth, 4=right ear, 5=left ear
   */
  fromFaceDetection(detection: {
    boundingBox: { xmin:number; ymin:number; width:number; height:number };
    landmarks: { x:number; y:number }[];
    confidence: number;
  }): FaceLandmarks {
    const { xmin, ymin, width, height } = detection.boundingBox;
    const lm = detection.landmarks;

    const rightEye = lm[0] ?? { x: xmin + width * 0.35, y: ymin + height * 0.35 };
    const leftEye  = lm[1] ?? { x: xmin + width * 0.65, y: ymin + height * 0.35 };
    const noseTip  = lm[2] ?? { x: xmin + width * 0.50, y: ymin + height * 0.55 };

    return {
      noseTip,
      faceLeft:   { x: xmin,          y: ymin + height / 2 },
      faceRight:  { x: xmin + width,  y: ymin + height / 2 },
      faceTop:    { x: xmin + width/2, y: ymin },
      faceBottom: { x: xmin + width/2, y: ymin + height },
      eyeCentre:  { x: (rightEye.x + leftEye.x) / 2, y: (rightEye.y + leftEye.y) / 2 },
    };
  },

  /**
   * 1-SHOT POSE VERIFICATION
   * Evaluates if a single static snapshot satisfies the challenge direction.
   */
  evaluateSinglePose(
    direction: ChallengeDirection,
    detection: {
      boundingBox: { xmin:number; ymin:number; width:number; height:number };
      landmarks: { x:number; y:number }[];
      confidence: number;
    }
  ): boolean {
    const landmarks = this.fromFaceDetection(detection);
    
    const faceWidth  = landmarks.faceRight.x  - landmarks.faceLeft.x;
    const faceHeight = landmarks.faceBottom.y - landmarks.faceTop.y;
    if (faceWidth <= 0 || faceHeight <= 0) return false;

    const yawRatio   = (landmarks.noseTip.x - landmarks.faceLeft.x) / faceWidth;
    const pitchRatio = (landmarks.noseTip.y - landmarks.eyeCentre.y) / faceHeight;

    console.log(`[Liveness] Direction: ${direction} | Yaw: ${yawRatio.toFixed(3)} | Pitch: ${pitchRatio.toFixed(3)}`);

    switch (direction) {
      case 'LEFT':  return yawRatio < YAW_LEFT_MAX;
      case 'RIGHT': return yawRatio > YAW_RIGHT_MIN;
      case 'UP':    return pitchRatio > PITCH_UP_MIN;
      default:      return false;
    }
  },

  /** Human-readable progress string for the UI progress bar */
  progressText(state: LivenessChallengState): string {
    const pct = Math.round((state.holdCount / HOLD_FRAMES) * 100);
    return `${pct}%`;
  },

  progressFraction(state: LivenessChallengState): number {
    return Math.min(1, state.holdCount / HOLD_FRAMES);
  },
};
