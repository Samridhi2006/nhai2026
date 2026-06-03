/**
 * useFaceRegistration.ts - Production-grade face registration hook
 * 
 * Features:
 * - Proper file URI normalization
 * - Duplicate detection before DB write
 * - Comprehensive error handling with user-friendly messages
 * - Thread-safe file cleanup
 * - Model loading state management
 */

import { useRef, useState, useCallback } from 'react';
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';

import { DatabaseService } from '../services/DatabaseService';
import { EmbeddingService } from '../services/EmbeddingService';
import { TFLiteService } from '../services/TFLiteService';
import {
  normalizePhotoUri,
  verifyFileExists,
  findDuplicate,
  validateEmbedding,
} from '../utils/faceHelpers';
import { Logger } from '../utils/logger';

export interface RegistrationResult {
  success: boolean;
  employeeId?: string;
  error?: string;
}

export function useFaceRegistration() {
  const cameraRef = useRef<any>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [capturedEmbedding, setCapturedEmbedding] = useState<Float32Array | null>(null);
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);

  // Model readiness check
  const modelReady = TFLiteService.modelsAvailable;

  /**
   * STEP 1: Capture and extract embedding
   * Handles all file lifecycle and validation
   */
  const captureAndExtract = useCallback(async (): Promise<{
    embedding: Float32Array;
    photoUri: string;
  } | null> => {
    if (!cameraRef.current) {
      Alert.alert('Camera Error', 'Camera is not ready yet.');
      return null;
    }

    if (!modelReady) {
      Alert.alert('Model Loading', 'Face recognition model is still loading, please wait.');
      return null;
    }

    let rawPhotoPath: string | null = null;
    let normalizedUri: string | null = null;

    try {
      // STEP 1A: Capture photo -----------------------------------------------
      Logger.info('[Registration] Capturing photo...');
      
      let photo;
      try {
        photo = await cameraRef.current.takePhoto({
          qualityPrioritization: 'quality', // High quality for registration
          flash: 'off',
        });
        rawPhotoPath = photo.path;
      } catch (captureError) {
        console.error('[Registration] takePhoto failed:', captureError);
        throw new Error('Could not capture photo. Please try again.');
      }

      // STEP 1B: Normalize URI (fix Android issues) --------------------------
      if (!rawPhotoPath) {
        throw new Error('Photo path is empty');
      }
      normalizedUri = normalizePhotoUri(rawPhotoPath);
      Logger.info(`[Registration] Photo URI: ${normalizedUri}`);

      // STEP 1C: Verify file exists ------------------------------------------
      const fileExists = await verifyFileExists(normalizedUri);
      if (!fileExists) {
        console.error('[Registration] File missing at:', normalizedUri);
        throw new Error('Captured image file was not found on disk.');
      }

      // STEP 1D: Extract embedding --------------------------------------------
      Logger.info('[Registration] Extracting face embedding...');
      
      let embedding: Float32Array;
      try {
        embedding = await EmbeddingService.extractEmbeddingFromPath(normalizedUri);
      } catch (extractError) {
        console.error('[Registration] Embedding extraction failed:', extractError);
        throw new Error(
          'Face processing failed. Please ensure:\n\n' +
          '• Face is well-lit\n' +
          '• Face is centered\n' +
          '• Look directly at camera'
        );
      }

      // STEP 1E: Validate embedding -------------------------------------------
      // NOTE: EmbeddingService outputs 192D vectors, we validate for that
      const validation = validateEmbedding(embedding, 192);
      if (!validation.valid) {
        console.error('[Registration] Invalid embedding:', validation.error);
        throw new Error(`Face data validation failed: ${validation.error}`);
      }

      Logger.info(`[Registration] ✓ Embedding extracted: ${embedding.length}D, valid`);

      return { embedding, photoUri: normalizedUri };

    } catch (error) {
      // Cleanup on failure
      if (normalizedUri) {
        try {
          await FileSystem.deleteAsync(normalizedUri, { idempotent: true });
        } catch (cleanupError) {
          console.warn('[Registration] Cleanup failed:', cleanupError);
        }
      }
      throw error;
    }
  }, [modelReady]);

  /**
   * STEP 2: Register employee
   * Includes duplicate detection and database write
   */
  const registerEmployee = useCallback(async (
    name: string,
    designation: string = 'Staff',
    division: string = 'General'
  ): Promise<RegistrationResult> => {
    // Prevent double-tap re-entry
    if (isRegistering) {
      return { success: false, error: 'Registration already in progress' };
    }

    // Validation
    if (!name?.trim()) {
      Alert.alert('Validation', 'Please enter a name.');
      return { success: false, error: 'Name is required' };
    }

    if (!capturedEmbedding || !capturedPhotoUri) {
      Alert.alert('No Face Captured', 'Please capture a face first.');
      return { success: false, error: 'No face data available' };
    }

    setIsRegistering(true);

    try {
      // STEP 2A: Get existing employees for duplicate check ------------------
      Logger.info('[Registration] Checking for duplicates...');
      const existingEmployees = await DatabaseService.getAllEmployees();

      // Convert to format expected by findDuplicate
      const existingEmbeddings = existingEmployees.map(emp => ({
        id: emp.id,
        name: emp.fullName,
        embedding: emp.faceEmbedding,
      }));

      // STEP 2B: Duplicate detection -----------------------------------------
      const duplicate = await findDuplicate(
        Array.from(capturedEmbedding),
        existingEmbeddings
      );

      if (duplicate) {
        const similarityPct = Math.round(duplicate.similarity * 100);
        Alert.alert(
          'Duplicate Face Detected',
          `This face is already registered as:\n\n` +
          `${duplicate.name}\n\n` +
          `Match confidence: ${similarityPct}%`,
          [{ text: 'OK' }]
        );
        return {
          success: false,
          error: `Duplicate of ${duplicate.name} (${similarityPct}% match)`,
        };
      }

      // STEP 2C: Generate employee ID ----------------------------------------
      const timestamp = Date.now();
      const employeeId = `NHAI-${new Date().getFullYear()}-${String(timestamp).slice(-6)}`;

      // STEP 2D: Save to database --------------------------------------------
      Logger.info(`[Registration] Saving employee: ${name} (${employeeId})`);
      
      try {
        await DatabaseService.insertEmployee({
          employeeId,
          fullName: name.trim(),
          designation,
          division,
          faceEmbedding: Array.from(capturedEmbedding),
          registeredAt: new Date().toISOString(),
        });
      } catch (dbError) {
        console.error('[Registration] Database insert failed:', dbError);
        throw new Error('Could not save to local database.');
      }

      // STEP 2E: Success -----------------------------------------------------
      Logger.info(`[Registration] ✓ Registration successful: ${name} (${employeeId})`);
      
      Alert.alert(
        'Registration Successful ✅',
        `${name} has been registered!\n\nEmployee ID: ${employeeId}`,
        [{ text: 'OK' }]
      );

      // Clear captured data for next registration
      setCapturedEmbedding(null);
      setCapturedPhotoUri(null);

      return { success: true, employeeId };

    } catch (error: any) {
      // Single user-facing failure point
      const errorMessage = error?.message ?? 'Unknown error occurred';
      Alert.alert('Registration Failed', errorMessage);
      
      Logger.error('[Registration] Failed:', error);
      
      return { success: false, error: errorMessage };

    } finally {
      // CRITICAL: Always reset loading state
      setIsRegistering(false);
    }
  }, [isRegistering, capturedEmbedding, capturedPhotoUri]);

  /**
   * Combined capture + store flow
   */
  const captureForRegistration = useCallback(async () => {
    if (isRegistering) return;

    setIsRegistering(true);

    try {
      const result = await captureAndExtract();
      
      if (result) {
        setCapturedEmbedding(result.embedding);
        setCapturedPhotoUri(result.photoUri);
        Alert.alert('Success', 'Face captured! Please enter employee details and tap Register.');
      }
    } catch (error: any) {
      Alert.alert('Capture Failed', error?.message ?? 'Unknown error');
    } finally {
      setIsRegistering(false);
    }
  }, [isRegistering, captureAndExtract]);

  /**
   * Clear captured data
   */
  const clearCapture = useCallback(() => {
    setCapturedEmbedding(null);
    setCapturedPhotoUri(null);
  }, []);

  return {
    // Refs
    cameraRef,
    
    // State
    isRegistering,
    modelReady,
    hasCapturedFace: !!capturedEmbedding,
    capturedPhotoUri,
    
    // Actions
    captureForRegistration,
    registerEmployee,
    clearCapture,
  };
}
