/**
 * Type Definitions for NHAI Facial Recognition
 */

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

export interface StoredFace {
  id: string;
  name: string;
  embedding: Float32Array;
  timestamp: number;
  embeddingHash: string;
}

export interface AttendanceRecord {
  id: string;
  faceId: string;
  timestamp: number;
  location?: string;
  confidence: number;
  photo?: string;
  syncStatus: 'pending' | 'synced' | 'failed';
}

export interface LivenessState {
  isAlive: boolean;
  blinkCount: number;
  eyeOpenness: number;
  confidence: number;
}

export interface MatchResult {
  face: StoredFace;
  score: number;
}

export interface SyncRecord {
  id: string;
  tableName: string;
  recordId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: any;
  retryCount: number;
  createdAt: number;
}

export interface AppConfig {
  // Inference settings
  detectionThreshold: number;
  matchingThreshold: number;
  minBlinkCount: number;
  
  // UI settings
  cameraFrameRate: number;
  
  // AWS settings
  awsEndpoint: string;
  awsRegion: string;
}
