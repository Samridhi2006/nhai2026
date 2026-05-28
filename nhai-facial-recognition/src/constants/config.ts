/**
 * Application Configuration
 */

export const CONFIG = {
  // Camera
  CAMERA_FPS: 30,
  CAMERA_FRAME_RATE: 30000, // microseconds

  // Face Detection (BlazeFace)
  FACE_DETECTION_THRESHOLD: 0.5,
  MIN_FACE_SIZE: 0.1, // 10% of frame

  // Face Embedding (MobileFaceNet)
  EMBEDDING_DIMENSION: 128,
  EMBEDDING_CROP_SIZE: 112,

  // Liveness Detection
  MIN_VALID_BLINKS: 2,
  EYE_OPENNESS_THRESHOLD: 0.3,
  MIN_BLINK_DURATION: 100, // ms
  MAX_BLINK_DURATION: 400, // ms
  BLINK_DETECTION_WINDOW: 15, // frames @ 30FPS

  // Face Matching
  MATCH_THRESHOLD: 0.6, // Cosine similarity threshold
  CONFIDENCE_THRESHOLD: 0.95, // Detection confidence

  // Storage
  MAX_STORED_FACES: 1000,
  ATTENDANCE_RETENTION_DAYS: 90,

  // Preprocessing
  RESIZE_WIDTH: 320,
  RESIZE_HEIGHT: 320,

  // AWS
  AWS_ENDPOINT: 'https://api.nhai-facial-recognition.com',
  AWS_REGION: 'us-east-1',

  // Sync
  SYNC_BATCH_SIZE: 10,
  SYNC_RETRY_MAX: 3,
  SYNC_RETRY_DELAY: 1000, // ms

  // Memory
  MAX_FRAME_BUFFER_SIZE: 320 * 320 * 4, // RGBA
};

export const MODEL_PATHS = {
  BLAZEFACE: 'blazeface.tflite',
  MOBILEFACENET: 'mobilefacenet_int8.tflite',
  BLINK_DETECTOR: 'blink_detector.tflite',
};

export const SCREENS = {
  HOME: 'Home',
  ATTENDANCE: 'Attendance',
  REGISTRATION: 'Registration',
  VERIFICATION: 'Verification',
};

// Model sizes
export const MODEL_SIZES = {
  BLAZEFACE: 320, // KB
  MOBILEFACENET: 3500, // KB
  BLINK_DETECTOR: 500, // KB
};
