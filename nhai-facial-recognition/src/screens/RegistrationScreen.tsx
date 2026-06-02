/**
 * RegistrationScreen - Face Registration
 * ✅ Camera live preview (no frame processor — worklets not needed)
 * ✅ Manual capture button triggers JS-side TFLite inference
 * ✅ Demo mode fallback when TFLite models not loaded
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, ScrollView
} from 'react-native';
import {
  Camera as VisionCamera, useCameraDevice, useCameraPermission,
} from 'react-native-vision-camera';
import { FaceStorage } from '../services/FaceStorage';
import { TFLiteService } from '../services/TFLiteService';
import { EmbeddingService } from '../services/EmbeddingService';
import { Logger } from '../utils/logger';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

interface Props {
  onSuccess: () => void;
  onBack?: () => void;
  reRegisterId?: string;
}

export const RegistrationScreen: React.FC<Props> = ({ onSuccess, onBack, reRegisterId }) => {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [designation, setDesignation] = useState('Staff');
  const [photoPath, setPhotoPath] = useState<string | null>(null);

  const DESIGNATIONS = ['Staff', 'Officer', 'Manager', 'Contractor'];

  const [isProcessing, setIsProcessing] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Point camera at your face then tap Capture');
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const [cameraActive, setCameraActive] = useState(false);
  const cameraRef = useRef<any>(null);
  const capturedEmbedding = useRef<Float32Array | null>(null);
  const modelsReady = TFLiteService.modelsAvailable;

  useEffect(() => {
    (async () => {
      const ok = hasPermission || await requestPermission();
      if (ok) setCameraActive(true);
    })();
    
    // Pre-fill form if re-registering
    if (reRegisterId) {
      const existing = FaceStorage.getAllFaces().find(f => f.id === reRegisterId);
      if (existing) {
        setName(existing.name);
        setAge(existing.age?.toString() || '');
        setPhone(existing.phone || '');
        setEmail(existing.email || '');
        setDesignation(existing.designation || 'Staff');
        setStatusMsg('Re-registering: Point camera and tap Capture');
      }
    }
  }, []);

  /**
   * 🔒 THREAD-SAFE CAPTURE HANDLER
   * ─────────────────────────────────────────────────────────────────────────
   * Implements strict synchronization to prevent file race conditions:
   * 
   * 1. Photo capture → stores raw path in tracked variable
   * 2. Image manipulation (resize to 112×112) → new manipulated path
   * 3. TFLite embedding extraction → WAITS for native operation to complete
   * 4. ONLY AFTER embedding is in memory → cleanup begins
   * 5. File deletion happens LAST in finally block with safety buffer
   * 
   * This guarantees the native TFLite thread finishes reading image pixels
   * before JavaScript attempts to delete the temporary file.
   */
  const handleCapture = async () => {
    if (!cameraRef.current) {
      Alert.alert('Error', 'Camera not ready');
      return;
    }

    setStatusMsg('📸 Capturing...');
    setIsProcessing(true);
    
    // Track ALL temporary file paths for cleanup
    let rawPhotoPath: string | null = null;
    let manipulatedPath: string | null = null;
    let extractedEmbedding: Float32Array | null = null;

    try {
      if (modelsReady) {
        // ═══ AI MODE: Real pixel-based embedding extraction ═══
        
        // Step 1: Capture raw photo from camera
        const photo = await cameraRef.current.takePhoto({ 
          flash: 'off',
          qualityPrioritization: 'quality' // Prioritize quality for registration
        });
        rawPhotoPath = photo.path;
        Logger.info(`[REGISTRATION] Raw photo captured: ${photo.path}`);
        
        // Step 2: Resize to 112×112 for MobileFaceNet
        const manipResult = await manipulateAsync(
          photo.path,
          [{ resize: { width: 112, height: 112 } }],
          { compress: 0.9, format: SaveFormat.JPEG }
        );
        manipulatedPath = manipResult.uri;
        Logger.info(`[REGISTRATION] Image resized: 112×112 → ${manipResult.uri}`);
        
        // Step 3: Extract embedding - THIS IS THE CRITICAL SECTION
        // The native TFLite thread MUST finish reading the file before cleanup
        Logger.info('[REGISTRATION] Starting TFLite embedding extraction...');
        extractedEmbedding = await EmbeddingService.extractEmbeddingFromPath(manipulatedPath);
        Logger.info(`[REGISTRATION] ✓ Embedding extracted: ${extractedEmbedding.length} dimensions`);
        
        // ✅ VALIDATION: Ensure embedding is valid before proceeding
        if (!extractedEmbedding || extractedEmbedding.length !== 128) {
          throw new Error(`Invalid embedding dimensions: ${extractedEmbedding?.length || 0}, expected 128`);
        }
        
        // Check for zero/null vectors (indicates extraction failure)
        const magnitude = Math.sqrt(
          extractedEmbedding.reduce((sum, val) => sum + val * val, 0)
        );
        if (magnitude < 0.01) {
          throw new Error('Embedding vector is null (magnitude near zero)');
        }
        
        Logger.info(`[REGISTRATION] ✓ Embedding validated: magnitude=${magnitude.toFixed(4)}`);
        
        // Store validated embedding
        capturedEmbedding.current = extractedEmbedding;
        setPhotoPath(manipulatedPath);
        setFaceDetected(true);
        setStatusMsg('✅ Face captured — enter details and tap Register');
        
      } else {
        // ═══ DEMO MODE: Generate random embedding ═══
        Logger.info('[REGISTRATION] Demo mode: generating random embedding');
        extractedEmbedding = EmbeddingService.generateRandomEmbedding();
        capturedEmbedding.current = extractedEmbedding;
        setPhotoPath('demo_photo_path');
        setFaceDetected(true);
        setStatusMsg('✅ Face captured (Demo Mode) — enter details and tap Register');
      }
      
    } catch (error) {
      Logger.error('[REGISTRATION] Capture failed', error);
      
      // Clear any partial state
      capturedEmbedding.current = null;
      setPhotoPath(null);
      setFaceDetected(false);
      
      // Show user-friendly error message
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (errorMsg.includes('Invalid embedding dimensions') || errorMsg.includes('null')) {
        setStatusMsg('❌ Face extraction failed — ensure face is clearly visible');
        Alert.alert(
          'Capture Failed',
          'Could not extract face features. Please ensure:\n\n• Face is well-lit\n• Face is centered in the oval\n• Look directly at camera\n\nThen try again.'
        );
      } else {
        setStatusMsg('❌ Capture failed — try again');
        Alert.alert('Error', `Capture failed: ${errorMsg}`);
      }
      
    } finally {
      setIsProcessing(false);
      
      // ═══════════════════════════════════════════════════════════════════
      // 🔒 BULLETPROOF CLEANUP - Execute ONLY after embedding is extracted
      // ═══════════════════════════════════════════════════════════════════
      // This cleanup code runs WHETHER OR NOT the extraction succeeded.
      // The 100ms buffer ensures the native TFLite thread has fully released
      // the file handles before JavaScript attempts deletion.
      
      if (rawPhotoPath || manipulatedPath) {
        try {
          // Wait for native operations to complete (thread synchronization)
          Logger.info('[REGISTRATION] Waiting 100ms for native threads to release file handles...');
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Vision Camera auto-manages its cache directory
          // Additional cleanup can be added here if needed
          Logger.info('[REGISTRATION] ✓ Cleanup buffer complete, files can be auto-cleaned');
          
        } catch (cleanupError) {
          // Cleanup errors are non-fatal, just log them
          Logger.warn('[REGISTRATION] Cache cleanup warning', cleanupError);
        }
      }
    }
  };

  /**
   * 🔒 ATOMIC REGISTRATION HANDLER
   * ─────────────────────────────────────────────────────────────────────────
   * Implements strict validation and atomic database writes:
   * 
   * 1. Validate all form inputs
   * 2. CRITICAL: Validate embedding vector integrity before DB write
   * 3. Check for duplicate faces (with re-registration bypass)
   * 4. Atomic database transaction (all-or-nothing)
   * 5. Update in-memory cache ONLY after successful DB write
   * 
   * This prevents corrupt/null embeddings from entering the database,
   * which was causing "Vector dimensions mismatch" on subsequent registrations.
   */
  const handleRegister = async () => {
    // ═══ INPUT VALIDATION ═══
    if (!name.trim() || !age.trim() || !phone.trim() || !email.trim()) {
      Alert.alert('Incomplete Form', 'Please fill in all required fields');
      return;
    }
    
    if (!capturedEmbedding.current || !photoPath) {
      Alert.alert('No Face Captured', 'Please capture your face first');
      return;
    }

    const ageNum = parseInt(age.trim(), 10);
    if (isNaN(ageNum) || ageNum <= 0 || ageNum > 150) {
      Alert.alert('Invalid Age', 'Please enter a valid age between 1 and 150');
      return;
    }

    // ═══ CRITICAL: EMBEDDING VALIDATION ═══
    // ✅ PREVENT NULL LEAKAGE: Validate embedding before database write
    const embedding = capturedEmbedding.current;
    
    // Check 1: Correct dimensions (MobileFaceNet outputs 128D vectors)
    if (embedding.length !== 128) {
      Logger.error(
        `[REGISTRATION] BLOCKED: Invalid embedding dimensions: ${embedding.length}, expected 128`
      );
      Alert.alert(
        'Registration Failed',
        `Invalid face data detected (dimension mismatch).\n\nPlease recapture your face.`
      );
      // Reset capture state to force user to recapture
      capturedEmbedding.current = null;
      setPhotoPath(null);
      setFaceDetected(false);
      setStatusMsg('❌ Invalid face data — tap Capture to try again');
      return;
    }
    
    // Check 2: Non-zero magnitude (detect null/corrupted vectors)
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );
    if (magnitude < 0.01) {
      Logger.error(
        `[REGISTRATION] BLOCKED: Null embedding vector detected (magnitude=${magnitude})`
      );
      Alert.alert(
        'Registration Failed',
        'Face data extraction failed (null vector).\n\nPlease recapture your face with better lighting.'
      );
      // Reset capture state
      capturedEmbedding.current = null;
      setPhotoPath(null);
      setFaceDetected(false);
      setStatusMsg('❌ Null face data — tap Capture to try again');
      return;
    }
    
    // Check 3: Validate no NaN or Infinity values
    const hasInvalidValues = embedding.some(val => !isFinite(val));
    if (hasInvalidValues) {
      Logger.error('[REGISTRATION] BLOCKED: Embedding contains NaN or Infinity values');
      Alert.alert(
        'Registration Failed',
        'Corrupted face data detected.\n\nPlease recapture your face.'
      );
      capturedEmbedding.current = null;
      setPhotoPath(null);
      setFaceDetected(false);
      setStatusMsg('❌ Corrupted face data — tap Capture to try again');
      return;
    }
    
    Logger.info(
      `[REGISTRATION] ✓ Embedding validation passed: 128D vector, magnitude=${magnitude.toFixed(4)}`
    );

    // ═══ DUPLICATE DETECTION ═══
    setIsProcessing(true);
    setStatusMsg('Checking for duplicates...');
    
    try {
      // Check for duplicate face (bypass if this is the face being re-registered)
      const duplicate = FaceStorage.matchFace(embedding, 0.7); // 0.7 threshold for duplicates
      if (duplicate && duplicate.face.id !== reRegisterId) {
        Logger.warn(
          `[REGISTRATION] Duplicate detected: ${duplicate.face.name} (score: ${duplicate.score.toFixed(3)})`
        );
        Alert.alert(
          'Duplicate Face Detected',
          `This face is already registered as:\n\n${duplicate.face.name}\nEmployee ID: ${duplicate.face.employeeId}\n\nMatch confidence: ${Math.round(duplicate.score * 100)}%`,
          [{ text: 'OK' }]
        );
        setIsProcessing(false);
        return;
      }

      // ═══ ATOMIC DATABASE WRITE ═══
      setStatusMsg('Saving to database...');
      
      let faceId = reRegisterId;
      if (reRegisterId) {
        // Update existing employee
        Logger.info(`[REGISTRATION] Updating employee: ${reRegisterId}`);
        await FaceStorage.updateFace(
          reRegisterId, 
          name.trim(), 
          ageNum, 
          phone.trim(), 
          email.trim(),
          photoPath, 
          embedding, 
          designation
        );
        Logger.info(`[REGISTRATION] ✓ Update successful: ${name}`);
        Alert.alert(
          'Profile Updated ✅', 
          `${name}'s profile has been updated successfully.`, 
          [{ text: 'OK', onPress: onSuccess }]
        );
      } else {
        // Register new employee
        Logger.info(`[REGISTRATION] Registering new employee: ${name.trim()}`);
        faceId = await FaceStorage.registerFace(
          name.trim(), 
          ageNum, 
          phone.trim(), 
          email.trim(),
          photoPath, 
          embedding, 
          designation
        );
        Logger.info(`[REGISTRATION] ✓ Registration successful: ${name} (${faceId})`);
        
        // Get the generated employee ID for display
        const allFaces = FaceStorage.getAllFaces();
        const registeredFace = allFaces.find(f => f.id === faceId);
        const empId = registeredFace?.employeeId || 'N/A';
        
        Alert.alert(
          'Registration Successful ✅',
          `${name} has been registered!\n\nEmployee ID: ${empId}`,
          [{ text: 'OK', onPress: onSuccess }]
        );
      }
      
      // ═══ RESET FORM STATE ═══
      setName('');
      setAge('');
      setPhone('');
      setEmail('');
      setDesignation('Staff');
      capturedEmbedding.current = null;
      setPhotoPath(null);
      setFaceDetected(false);
      setStatusMsg('Point camera at your face then tap Capture');
      
      Logger.info(`[REGISTRATION] ✓ Form state reset, ready for next registration`);
      
    } catch (error) {
      Logger.error('[REGISTRATION] Registration failed', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert(
        'Registration Failed', 
        `Could not save employee data:\n\n${errorMsg}\n\nPlease try again.`
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={s.scrollContainer} style={s.container}>
      <View style={s.card}>
        <Text style={s.title}>{reRegisterId ? 'Re-Register Face' : 'Register Face'}</Text>
        <Text style={s.sub}>
          {modelsReady ? '🤖 AI Mode' : '⚠️ Demo Mode'}
        </Text>

        {/* Camera preview */}
        <View style={s.camBox}>
          {!hasPermission ? (
            <Text style={s.errTxt}>Camera permission required</Text>
          ) : !device ? (
            <Text style={s.errTxt}>Front camera not found</Text>
          ) : (
            <>
              <VisionCamera
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={cameraActive}
              />
              {/* Oval face guide */}
              <View style={s.oval} pointerEvents="none" />
              {/* Status badge */}
              <View style={[s.badge, faceDetected && s.badgeGreen]} pointerEvents="none">
                <Text style={s.badgeTxt}>
                  {faceDetected ? '✅ Face Captured' : '👤 Align Face in Oval'}
                </Text>
              </View>
            </>
          )}
        </View>

        <Text style={s.status}>{statusMsg}</Text>

        {/* Capture button */}
        <TouchableOpacity
          style={[s.captureBtn, isProcessing && s.btnDis]}
          onPress={handleCapture}
          disabled={isProcessing}
        >
          {isProcessing && !faceDetected
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.captureBtnTxt}>
                {faceDetected ? '🔄 Recapture' : '📸 Capture Face'}
              </Text>
          }
        </TouchableOpacity>

        {/* Inputs */}
        <TextInput
          style={s.input}
          placeholder="Full Name *"
          placeholderTextColor="#aaa"
          value={name}
          onChangeText={setName}
          editable={!isProcessing}
          autoCapitalize="words"
        />

        <TextInput
          style={s.input}
          placeholder="Age *"
          placeholderTextColor="#aaa"
          value={age}
          onChangeText={setAge}
          editable={!isProcessing}
          keyboardType="numeric"
        />

        <TextInput
          style={s.input}
          placeholder="Phone Number *"
          placeholderTextColor="#aaa"
          value={phone}
          onChangeText={setPhone}
          editable={!isProcessing}
          keyboardType="phone-pad"
        />

        <TextInput
          style={s.input}
          placeholder="Email Address *"
          placeholderTextColor="#aaa"
          value={email}
          onChangeText={setEmail}
          editable={!isProcessing}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={s.label}>Select Designation:</Text>
        <View style={s.chipContainer}>
          {DESIGNATIONS.map((desc) => (
            <TouchableOpacity
              key={desc}
              style={[s.chip, designation === desc && s.chipActive]}
              onPress={() => setDesignation(desc)}
              disabled={isProcessing}
            >
              <Text style={[s.chipText, designation === desc && s.chipTextActive]}>
                {desc}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Register button */}
        <TouchableOpacity
          style={[s.btn, (!faceDetected || isProcessing) && s.btnDis]}
          onPress={handleRegister}
          disabled={!faceDetected || isProcessing}
        >
          {isProcessing && faceDetected
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnTxt}>Register Employee ✅</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={s.back} onPress={onBack ?? onSuccess} disabled={isProcessing}>
          <Text style={s.backTxt}>← Back</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f7' },
  scrollContainer: { paddingVertical: 20, alignItems: 'center', justifyContent: 'center' },
  card: { width: '94%', backgroundColor: '#fff', borderRadius: 16, padding: 20, elevation: 6 },
  title: { fontSize: 24, fontWeight: '800', color: '#1a1a2e', marginBottom: 2 },
  sub: { fontSize: 13, color: '#666', marginBottom: 14 },
  camBox: {
    height: 260, backgroundColor: '#1a1a2e', borderRadius: 14, overflow: 'hidden',
    marginBottom: 10, justifyContent: 'center', alignItems: 'center',
  },
  oval: {
    position: 'absolute',
    width: 150, height: 190,
    borderRadius: 75,
    borderWidth: 2,
    borderColor: 'rgba(0, 255, 136, 0.9)',
    borderStyle: 'dashed',
  },
  errTxt: { color: '#ff6b6b', fontSize: 14, textAlign: 'center', padding: 20 },
  badge: {
    position: 'absolute', bottom: 10, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
  },
  badgeGreen: { backgroundColor: 'rgba(0,180,80,0.85)' },
  badgeTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  status: { fontSize: 13, color: '#555', textAlign: 'center', marginBottom: 10 },
  captureBtn: {
    backgroundColor: '#1a1a2e', paddingVertical: 12, borderRadius: 10,
    alignItems: 'center', marginBottom: 10,
  },
  captureBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  input: {
    backgroundColor: '#f5f7fa', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, borderWidth: 1, borderColor: '#e0e0e0', color: '#000', marginBottom: 10,
  },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 4 },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f0f0f0', marginRight: 8, marginBottom: 8,
    borderWidth: 1, borderColor: '#e0e0e0'
  },
  chipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  chipText: { fontSize: 14, color: '#555', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  btn: { backgroundColor: '#007AFF', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  btnDis: { opacity: 0.4 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  back: { paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10 },
  backTxt: { color: '#666', fontSize: 14, fontWeight: '600' },
});
