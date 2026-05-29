/**
 * FaceStorage - Local Face Database & Matching
 * Handles face registration, storage, and cosine similarity matching
 */

import { cosineSimilarity, batchCosineSimilarity, MATCH_THRESHOLDS } from '../utils/math';

// Re-export for backward compatibility
export { cosineSimilarity, batchCosineSimilarity, MATCH_THRESHOLDS };

/**
 * MobileFaceNet INT8 accuracy profile
 */
export const ACCURACY_PROFILE = {
  model: 'MobileFaceNet INT8',
  lfwAccuracy: 0.98,
  falseAcceptanceRate: 0.001, // 0.1% at threshold 0.6
  falseRejectionRate: 0.05, // 5% at threshold 0.6
  recommendedThreshold: 0.6,
};

export interface StoredFace {
  id: string;
  name: string;
  embedding: Float32Array;
  timestamp: number;
  embeddingHash: string;
}

export interface MatchResult {
  face: StoredFace;
  score: number; // [0, 1] cosine similarity
}

export class FaceStorage {
  private static instance: FaceStorage;
  private facesCache: Map<string, StoredFace> = new Map();
  private isInitialized = false;

  private constructor() {}

  static getInstance(): FaceStorage {
    if (!FaceStorage.instance) {
      FaceStorage.instance = new FaceStorage();
    }
    return FaceStorage.instance;
  }

  /**
   * Initialize storage (load faces from database)
   */
  static async initialize(): Promise<void> {
    const service = FaceStorage.getInstance();
    if (service.isInitialized) return;

    try {
      // Load faces from SQLite (in production)
      // For now, initialize empty cache
      service.facesCache.clear();
      service.isInitialized = true;
      console.log('FaceStorage initialized');
    } catch (error) {
      console.error('FaceStorage initialization error:', error);
      throw error;
    }
  }

  /**
   * Register a new face
   */
  static async registerFace(
    name: string,
    embedding: Float32Array
  ): Promise<string> {
    const service = FaceStorage.getInstance();
    if (!service.isInitialized) {
      throw new Error('FaceStorage not initialized');
    }

    const faceId = generateId();
    const face: StoredFace = {
      id: faceId,
      name,
      embedding: embedding.slice(), // Copy embedding
      timestamp: Date.now(),
      embeddingHash: calculateHash(embedding),
    };

    // Store in cache
    service.facesCache.set(faceId, face);

    // In production: also store in encrypted SQLite with:
    // - AES-256-GCM encrypted embedding
    // - Encrypted photo (if provided)
    // - Sync status (pending/synced)

    console.log(`✓ Face registered: ${name} (${faceId})`);

    return faceId;
  }

  /**
   * Match face embedding against database
   * Returns best match if similarity > threshold
   */
  static matchFace(
    queryEmbedding: Float32Array,
    threshold: number = 0.6
  ): MatchResult | null {
    const service = FaceStorage.getInstance();
    if (!service.isInitialized || service.facesCache.size === 0) {
      return null;
    }

    let bestMatch: MatchResult | null = null;
    let bestScore = threshold;

    // Compare against all stored faces
    for (const face of service.facesCache.values()) {
      const score = cosineSimilarity(queryEmbedding, face.embedding);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          face,
          score,
        };
      }
    }

    return bestMatch;
  }

  /**
   * Get all registered faces
   */
  static getAllFaces(): StoredFace[] {
    const service = FaceStorage.getInstance();
    return Array.from(service.facesCache.values());
  }

  /**
   * Delete a face
   */
  static async deleteFace(faceId: string): Promise<void> {
    const service = FaceStorage.getInstance();
    service.facesCache.delete(faceId);

    // In production: also delete from SQLite and add to sync queue
    console.log(`✓ Face deleted: ${faceId}`);
  }

  /**
   * Get face statistics
   */
  static getStats() {
    const service = FaceStorage.getInstance();
    return {
      totalFaces: service.facesCache.size,
      isInitialized: service.isInitialized,
      cacheSize: service.facesCache.size,
    };
  }
}

// Utility functions
function generateId(): string {
  // Simple UUID-like ID generation
  return `face_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function calculateHash(embedding: Float32Array): string {
  // Simple hash for embedding
  let hash = 0;
  for (let i = 0; i < Math.min(embedding.length, 32); i++) {
    const char = Math.floor(embedding[i] * 100) % 256;
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}
