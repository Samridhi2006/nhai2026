/**
 * FaceStorage - In-memory cache backed by DatabaseService SQLite
 * Compatibility layer between old screen APIs and new typed DatabaseService
 */

import { cosineSimilarity, batchCosineSimilarity, MATCH_THRESHOLDS } from '../utils/math';
import { DatabaseService } from './DatabaseService';
import type { Employee } from '../types/Employee';
import { Logger } from '../utils/logger';

export { cosineSimilarity, batchCosineSimilarity, MATCH_THRESHOLDS };

export const ACCURACY_PROFILE = {
  model: 'MobileFaceNet INT8', lfwAccuracy: 0.98,
  falseAcceptanceRate: 0.001, falseRejectionRate: 0.05, recommendedThreshold: 0.6,
};

/**
 * Legacy interface for backward compatibility with existing screens.
 * Maps to new Employee schema internally.
 */
export interface StoredFace {
  id: string;           // Maps to Employee.employeeId (string for compatibility)
  name: string;         // Maps to Employee.fullName
  employeeId: string;   // Maps to Employee.employeeId
  designation: string;  // Maps to Employee.designation
  age: number;          // Legacy field (not in new schema)
  phone: string;        // Legacy field (not in new schema)
  email: string;        // Legacy field (not in new schema)
  photoPath: string;    // Legacy field (not in new schema)
  embedding: Float32Array;  // Maps to Employee.faceEmbedding
  timestamp: number;    // Maps to Employee.registeredAt (converted from ISO string)
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
    
    svc.facesCache.clear();
    const employees = await DatabaseService.getAllEmployees();
    
    for (const emp of employees) {
      try {
        // DatabaseService already validates embeddings - all rows here are valid
        const embedding = new Float32Array(emp.faceEmbedding);
        
        // Map new schema to legacy StoredFace format
        svc.facesCache.set(emp.employeeId, {
          id: emp.employeeId,
          name: emp.fullName,
          employeeId: emp.employeeId,
          designation: emp.designation,
          age: 0,              // Not in new schema
          phone: '',           // Not in new schema
          email: '',           // Not in new schema
          photoPath: '',       // Not in new schema
          embedding,
          timestamp: new Date(emp.registeredAt).getTime(),
        });
      } catch (e) { 
        Logger.error(`Failed to load employee ${emp.employeeId}`, e); 
      }
    }
    
    svc.isInitialized = true;
    Logger.info(`FaceStorage: ${svc.facesCache.size} faces loaded from validated database`);
  }

  static async registerFace(
    name: string, 
    age: number,          // Legacy param - ignored
    phone: string,        // Legacy param - ignored
    email: string,        // Legacy param - ignored
    photoPath: string,    // Legacy param - ignored
    embedding: Float32Array,
    designation = 'Staff',
    division = 'General'
  ): Promise<string> {
    const svc = FaceStorage.getInstance();
    if (!svc.isInitialized) throw new Error('FaceStorage not initialized');
    
    // Generate NHAI employee ID
    const timestamp = Date.now();
    const empId = `NHAI-${new Date().getFullYear()}-${String(timestamp).slice(-6)}`;
    
    // Validate embedding before DB write
    if (embedding.length !== 128) {
      throw new Error(`Invalid embedding: ${embedding.length}D (expected 128D)`);
    }
    
    // Insert into new schema database
    await DatabaseService.insertEmployee({
      employeeId: empId,
      fullName: name,
      designation,
      division,
      faceEmbedding: Array.from(embedding),
      registeredAt: new Date().toISOString(),
    });
    
    // Update in-memory cache (legacy format)
    svc.facesCache.set(empId, {
      id: empId,
      name,
      employeeId: empId,
      designation,
      age,
      phone,
      email,
      photoPath,
      embedding: embedding.slice(),
      timestamp,
    });
    
    Logger.info(`Registered workforce: ${name} (${empId})`);
    return empId;
  }

  static async updateFace(
    id: string,           // employeeId
    name: string, 
    age: number,          // Legacy param - ignored
    phone: string,        // Legacy param - ignored
    email: string,        // Legacy param - ignored
    photoPath: string,    // Legacy param - ignored
    embedding: Float32Array, 
    designation = 'Staff',
    division = 'General'
  ): Promise<void> {
    const svc = FaceStorage.getInstance();
    if (!svc.isInitialized) throw new Error('FaceStorage not initialized');
    
    const existing = svc.facesCache.get(id);
    if (!existing) throw new Error('Employee not found');
    
    // Validate embedding before DB write
    if (embedding.length !== 128) {
      throw new Error(`Invalid embedding: ${embedding.length}D (expected 128D)`);
    }
    
    // Update in new schema database (INSERT OR REPLACE)
    await DatabaseService.insertEmployee({
      employeeId: id,
      fullName: name,
      designation,
      division,
      faceEmbedding: Array.from(embedding),
      registeredAt: existing.timestamp ? new Date(existing.timestamp).toISOString() : new Date().toISOString(),
    });
    
    // Update in-memory cache
    svc.facesCache.set(id, {
      ...existing,
      name,
      designation,
      age,
      phone,
      email,
      photoPath,
      embedding: embedding.slice(),
      timestamp: Date.now(),
    });
    
    Logger.info(`Updated workforce: ${name} (${id})`);
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

  static async deleteFace(employeeId: string): Promise<void> {
    const svc = FaceStorage.getInstance();
    
    // Find employee by employeeId to get numeric id
    const employee = await DatabaseService.findEmployeeById(employeeId);
    if (employee) {
      await DatabaseService.deleteEmployee(employee.id);
    }
    
    svc.facesCache.delete(employeeId);
  }

  static getStats() {
    const svc = FaceStorage.getInstance();
    return { totalFaces: svc.facesCache.size, isInitialized: svc.isInitialized };
  }
}
