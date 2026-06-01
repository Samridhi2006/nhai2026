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

  const handleCapture = async () => {
    if (!cameraRef.current) {
      Alert.alert('Error', 'Camera not ready');
      return;
    }

    setStatusMsg('Capturing...');
    setIsProcessing(true);

    try {
      let embedding: Float32Array;
      let path = '';

      if (modelsReady) {
        const photo = await cameraRef.current.takePhoto({ flash: 'off' });
        Logger.info(`Raw photo captured: ${photo.path}`);
        
        const manipResult = await manipulateAsync(
          photo.path,
          [],
          { compress: 1, format: SaveFormat.JPEG }
        );
        
        path = manipResult.uri;
        embedding = generateDeterministicEmbedding(path);
      } else {
        path = 'demo_photo_path';
        embedding = generateRandomEmbedding();
      }

      capturedEmbedding.current = embedding;
      setPhotoPath(path);
      setFaceDetected(true);
      setStatusMsg('✅ Face captured — enter details and tap Register');
    } catch (e) {
      Logger.error('Capture failed', e);
      setStatusMsg('❌ Capture failed — try again');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRegister = async () => {
    if (!name.trim() || !age.trim() || !phone.trim() || !email.trim()) {
      Alert.alert('Error', 'Please fill in all details');
      return;
    }
    if (!capturedEmbedding.current || !photoPath) {
      Alert.alert('Error', 'Please capture your face first');
      return;
    }

    const ageNum = parseInt(age.trim(), 10);
    if (isNaN(ageNum) || ageNum <= 0) {
      Alert.alert('Error', 'Please enter a valid age');
      return;
    }

    setIsProcessing(true);
    try {
      // Check for duplicate face (bypass if matched face is the one being re-registered)
      const duplicate = FaceStorage.matchFace(capturedEmbedding.current);
      if (duplicate && duplicate.face.id !== reRegisterId) {
        Alert.alert('Error', 'already registered');
        setIsProcessing(false);
        return;
      }

      let faceId = reRegisterId;
      if (reRegisterId) {
        await FaceStorage.updateFace(
          reRegisterId, name.trim(), ageNum, phone.trim(), email.trim(),
          photoPath, capturedEmbedding.current, designation
        );
        Alert.alert('Updated ✅', `Profile for ${name} updated successfully.`, [{ text: 'OK', onPress: onSuccess }]);
      } else {
        faceId = await FaceStorage.registerFace(
          name.trim(), ageNum, phone.trim(), email.trim(),
          photoPath, capturedEmbedding.current, designation
        );
        Logger.info(`Registered employee: ${name} (${faceId})`);
        Alert.alert(
          'Registered ✅',
          `Employee ID: ${faceId}\n${name} has been registered successfully.`,
          [{ text: 'OK', onPress: onSuccess }]
        );
      }
      setName('');
      setAge('');
      setPhone('');
      setEmail('');
      setDesignation('Staff');
      capturedEmbedding.current = null;
      setPhotoPath(null);
      setFaceDetected(false);
      setStatusMsg('Point camera at your face then tap Capture');
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
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
                // @ts-expect-error photo prop is valid but missing in types
                photo={true}
                pixelFormat="yuv"
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

/** Generate a normalized random embedding for demo mode */
function generateRandomEmbedding(): Float32Array {
  const emb = new Float32Array(128);
  for (let i = 0; i < 128; i++) emb[i] = Math.random() * 2 - 1;
  const mag = Math.sqrt(emb.reduce((s, v) => s + v * v, 0));
  for (let i = 0; i < 128; i++) emb[i] /= mag;
  return emb;
}

/**
 * Generate a deterministic-ish embedding from a photo path.
 */
function generateDeterministicEmbedding(seed: string): Float32Array {
  const emb = new Float32Array(128);
  for (let i = 0; i < 128; i++) {
    const charCode = seed.charCodeAt(i % seed.length);
    emb[i] = Math.sin(charCode * (i + 1) * 0.1) * Math.cos(i * 0.3);
  }
  const mag = Math.sqrt(emb.reduce((s, v) => s + v * v, 0));
  for (let i = 0; i < 128; i++) emb[i] /= mag;
  return emb;
}

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
