/**
 * Math Utilities - Cosine Similarity & Vector Operations
 */

/**
 * Calculate cosine similarity between two vectors
 * Range: [-1, 1], higher = more similar
 * For face embeddings: typically [0.3, 1.0]
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('Vector dimensions mismatch');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Batch cosine similarity (optimized for multiple comparisons)
 */
export function batchCosineSimilarity(
  query: Float32Array,
  database: Float32Array[],
  threshold: number = 0.5
): Array<{ score: number; index: number }> {
  let queryMag = 0;
  for (let i = 0; i < query.length; i++) {
    queryMag += query[i] * query[i];
  }
  queryMag = Math.sqrt(queryMag);

  const results: Array<{ score: number; index: number }> = [];

  for (let idx = 0; idx < database.length; idx++) {
    const stored = database[idx];
    let dotProduct = 0;
    let storedMag = 0;

    for (let i = 0; i < query.length; i++) {
      dotProduct += query[i] * stored[i];
      storedMag += stored[i] * stored[i];
    }

    storedMag = Math.sqrt(storedMag);
    const similarity = dotProduct / (queryMag * storedMag);

    if (similarity > threshold) {
      results.push({ score: similarity, index: idx });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Match confidence thresholds for MobileFaceNet INT8
 */
export const MATCH_THRESHOLDS = {
  veryStrict: 0.7,    // FRR 1%
  strict: 0.65,       // FRR 2%
  normal: 0.6,        // FRR 5% [DEFAULT]
  relaxed: 0.55,      // FRR 10%
};
