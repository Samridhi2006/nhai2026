/**
 * faceHelpers.ts - URI normalization and duplicate detection utilities
 * 
 * Fixes common Android camera issues:
 * - Missing file:// protocol
 * - Missing file extensions
 * - Duplicate face detection using cosine similarity
 */

import * as FileSystem from 'expo-file-system';

/**
 * FIX #1: Guarantee a readable file:// URI with a real extension
 * Fixes React Native Vision Camera issues on some Android builds
 */
export function normalizePhotoUri(rawPath: string): string {
  let uri = rawPath;
  
  // Ensure file:// protocol
  if (!uri.startsWith('file://')) {
    uri = `file://${uri}`;
  }
  
  // FIX for Vision Camera issue #3455: some builds drop the extension dot
  // Match patterns like "imagejpg" or "imagepng" without the dot
  if (/[^.]jpg$/.test(uri)) {
    uri = uri.replace(/jpg$/, '.jpg');
  }
  if (/[^.]png$/.test(uri)) {
    uri = uri.replace(/png$/, '.png');
  }
  
  return uri;
}

/**
 * Verify that a file URI exists and is readable
 * Returns true if file exists, false otherwise
 */
export async function verifyFileExists(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch (error) {
    console.error('[FileHelper] Error checking file:', error);
    return false;
  }
}

/**
 * Cosine similarity for face embedding comparison
 * Returns value between 0 (completely different) and 1 (identical)
 * 
 * Formula: cos(θ) = (A · B) / (||A|| × ||B||)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    console.warn(`[FaceHelper] Vector length mismatch: ${a.length} vs ${b.length}`);
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  
  if (denominator === 0) {
    console.warn('[FaceHelper] Zero-magnitude vector detected');
    return 0;
  }
  
  return dotProduct / denominator;
}

/**
 * Duplicate detection threshold (tune for your model)
 * 
 * Recommended values:
 * - 0.6: Relaxed (may allow twins)
 * - 0.7: Balanced (recommended for MobileFaceNet)
 * - 0.8: Strict (very similar faces required)
 * - 0.9: Very strict (almost identical)
 */
export const DUPLICATE_THRESHOLD = 0.7;

/**
 * Find duplicate face in existing employee database
 * Returns employee info if duplicate found, null otherwise
 */
export async function findDuplicate(
  newEmbedding: number[],
  existingEmployees: { id: number; name: string; embedding: number[] }[]
): Promise<{ id: number; name: string; similarity: number } | null> {
  let bestMatch: { id: number; name: string; similarity: number } | null = null;
  let highestSimilarity = DUPLICATE_THRESHOLD;
  
  for (const employee of existingEmployees) {
    // Guard against corrupted database rows with mismatched dimensions
    if (employee.embedding.length !== newEmbedding.length) {
      console.warn(
        `[FaceHelper] Skipping employee ${employee.id}: ` +
        `embedding dimension mismatch (${employee.embedding.length} vs ${newEmbedding.length})`
      );
      continue;
    }
    
    const similarity = cosineSimilarity(newEmbedding, employee.embedding);
    
    if (similarity >= highestSimilarity) {
      highestSimilarity = similarity;
      bestMatch = {
        id: employee.id,
        name: employee.name,
        similarity,
      };
    }
  }
  
  return bestMatch;
}

/**
 * Validate embedding vector integrity
 * Checks for:
 * - Correct dimensions
 * - No NaN values
 * - Non-zero magnitude
 */
export function validateEmbedding(
  embedding: number[] | Float32Array,
  expectedDim: number = 128
): { valid: boolean; error?: string } {
  // Check dimensions
  if (embedding.length !== expectedDim) {
    return {
      valid: false,
      error: `Invalid dimensions: ${embedding.length}, expected ${expectedDim}`,
    };
  }
  
  // Check for NaN or Infinity
  let sumSquares = 0;
  for (let i = 0; i < embedding.length; i++) {
    const val = embedding[i];
    if (!isFinite(val)) {
      return {
        valid: false,
        error: `Invalid value at index ${i}: ${val}`,
      };
    }
    sumSquares += val * val;
  }
  
  // Check for zero-magnitude vector
  if (sumSquares <= 1e-6) {
    return {
      valid: false,
      error: 'Zero-magnitude vector (null embedding)',
    };
  }
  
  return { valid: true };
}

/**
 * Calculate L2 (Euclidean) distance between two embeddings
 * Lower values = more similar
 * Used as alternative to cosine similarity
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
  
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  
  return Math.sqrt(sum);
}

/**
 * Normalize embedding vector to unit length
 * Useful for models that don't output normalized embeddings
 */
export function normalizeEmbedding(embedding: number[]): number[] {
  let magnitude = 0;
  for (let i = 0; i < embedding.length; i++) {
    magnitude += embedding[i] * embedding[i];
  }
  magnitude = Math.sqrt(magnitude);
  
  if (magnitude === 0) {
    console.warn('[FaceHelper] Cannot normalize zero-magnitude vector');
    return embedding;
  }
  
  return embedding.map(val => val / magnitude);
}
