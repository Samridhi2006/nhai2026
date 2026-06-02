/**
 * FaceStorage - In-memory cache backed by DatabaseService SQLite
 */

import { cosineSimilarity, batchCosineSimilarity, MATCH_THRESHOLDS } from '../utils/math';
import { DatabaseService } from './DatabaseService';
import { Logger } from '../utils/logger';

export { cosineSimilarity, batchCosineSimilarity, MATCH_THRESHOLDS };

export const ACCURACY_PROFILE = {
  model: 'MobileFaceNet INT8', lfwAccuracy: 0.98,
  falseAcceptanceRate: 0.001, falseRejectionRate: 0.05, recommendedThreshold: 0.6,
};

export interface StoredFace {
  id: string; name: string; employeeId: string; designation: string;
  age: number; phone: string; email: string; photoPath: string;
  embedding: Float32Array; timestamp: number;
}
export interface MatchResult { face: StoredFace; score: number; }

export class FaceStorage {
  private static instance: FaceStorage;
  private facesCache: Map<string, StoredFace> = new Map();
  private isInitialized = false;

  private constructor() {}

  static getInstance(): FaceStorage {
    if (!FaceStorage.instance) FaceStorage.instance = new FaceStorage();
    return FaceStorage.instance;
  }

  static async initialize(): Promise<void> {
    const svc = FaceStorage.getInstance();
    if (svc.isInitialized) return;
    const db = DatabaseService.getInstance();
    await db.initialize();
    svc.facesCache.clear();
    const employees = await db.getAllEmployees();
    for (const emp of employees) {
      try {
        const embedding = new Float32Array(JSON.parse(emp.embedding || '[]'));
        svc.facesCache.set(emp.id, {
          id: emp.id, name: emp.name, employeeId: emp.employee_id,
          designation: emp.designation, age: emp.age, phone: emp.phone,
          email: emp.email, photoPath: emp.photo_path,
          embedding, timestamp: emp.timestamp,
        });
      } catch (e) { Logger.error(`Bad embedding for employee registry object: ${emp.id}`, e); }
    }
    svc.isInitialized = true;
    Logger.info(`FaceStorage: ${svc.facesCache.size} faces successfully loaded into memory cache`);
  }

  static async registerFace(
    name: string, age: number, phone: string, email: string,
    photoPath: string, embedding: Float32Array,
    designation = 'Staff'
  ): Promise<string> {
    const svc = FaceStorage.getInstance();
    if (!svc.isInitialized) throw new Error('FaceStorage map memory engine not initialized');
    const id = `face_${Date.now()}_${Math.random().toString(36).substr(2,8)}`;
    const empId = `NHAI${Date.now().toString().slice(-6)}`;
    const db = DatabaseService.getInstance();
    await db.insertEmployee({
      id, employee_id: empId, name, designation, age, phone, email,
      photo_path: photoPath, embedding: JSON.stringify(Array.from(embedding)), timestamp: Date.now(),
    });
    svc.facesCache.set(id, {
      id, name, employeeId: empId, designation, age, phone, email,
      photoPath, embedding: embedding.slice(), timestamp: Date.now(),
    });
    Logger.info(`Registered workforce: ${name} (${empId})`);
    return id;
  }

  static async updateFace(
    id: string, name: string, age: number, phone: string, email: string,
    photoPath: string, embedding: Float32Array, designation = 'Staff'
  ): Promise<void> {
    const svc = FaceStorage.getInstance();
    if (!svc.isInitialized) throw new Error('FaceStorage map memory engine not initialized');
    
    const existing = svc.facesCache.get(id);
    if (!existing) throw new Error('Face not found');
    
    const empId = existing.employeeId;
    const db = DatabaseService.getInstance();
    
    await db.insertEmployee({
      id, employee_id: empId, name, designation, age, phone, email,
      photo_path: photoPath, embedding: JSON.stringify(Array.from(embedding))
    });
    
    svc.facesCache.set(id, {
      ...existing, name, designation, age, phone, email,
      photoPath, embedding: embedding.slice(), timestamp: Date.now(),
    });
    
    Logger.info(`Updated workforce: ${name} (${empId})`);
  }

  static matchFace(queryEmbedding: Float32Array, threshold = 0.6): MatchResult | null {
    const svc = FaceStorage.getInstance();
    if (!svc.isInitialized || svc.facesCache.size === 0) return null;
    let best: MatchResult | null = null;
    let bestScore = threshold;
    for (const face of svc.facesCache.values()) {
      const score = cosineSimilarity(queryEmbedding, face.embedding);
      if (score > bestScore) { bestScore = score; best = { face, score }; }
    }
    return best;
  }

  static getAllFaces(): StoredFace[] { return Array.from(FaceStorage.getInstance().facesCache.values()); }

  static async deleteFace(id: string): Promise<void> {
    const svc = FaceStorage.getInstance();
    await DatabaseService.getInstance().deleteEmployee(id);
    svc.facesCache.delete(id);
  }

  static getStats() {
    const svc = FaceStorage.getInstance();
    return { totalFaces: svc.facesCache.size, isInitialized: svc.isInitialized };
  }
}
