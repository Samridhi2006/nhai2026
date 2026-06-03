/**
 * RegistrationScreen - Face Registration
 * ✅ Camera live preview (no frame processor — worklets not needed)
 * ✅ Manual capture button triggers JS-side TFLite inference
 * ✅ Demo mode fallback when TFLite models not loaded
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, ScrollView
} from 'react-native';
import {
  Camera as VisionCamera, useCameraDevice, useCameraPermission,
} from 'react-native-vision-camera';
import { useFaceRegistration } from '../hooks/useFaceRegistration';
import { FaceStorage } from '../services/FaceStorage';
import { Logger } from '../utils/logger';

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

  const DESIGNATIONS = ['Staff', 'Officer', 'Manager', 'Contractor'];

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const [cameraActive, setCameraActive] = useState(false);

  // Use the production-grade registration hook
  const {
    cameraRef,
    isRegistering,
    modelReady,
    hasCapturedFace,
    captureForRegistration,
    registerEmployee,
    clearCapture,
  } = useFaceRegistration();

  const [statusMsg, setStatusMsg] = useState('Point camera at your face then tap Capture');

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
  }, [hasPermission, requestPermission, reRegisterId]);

  /**
   * Handle face capture using the production-grade hook
   */
  const handleCapture = async () => {
    setStatusMsg('📸 Capturing...');
    
    try {
      await captureForRegistration();
      
      if (hasCapturedFace) {
        setStatusMsg('✅ Face captured — enter details and tap Register');
      }
    } catch (error) {
      Logger.error('[REGISTRATION] Capture failed', error);
      setStatusMsg('❌ Capture failed — try again');
    }
  };

  /**
   * Handle employee registration using the production-grade hook
   */
  const handleRegister = async () => {
    // ═══ INPUT VALIDATION ═══
    if (!name.trim() || !age.trim() || !phone.trim() || !email.trim()) {
      Alert.alert('Incomplete Form', 'Please fill in all required fields');
      return;
    }
    
    if (!hasCapturedFace) {
      Alert.alert('No Face Captured', 'Please capture your face first');
      return;
    }

    const ageNum = parseInt(age.trim(), 10);
    if (isNaN(ageNum) || ageNum <= 0 || ageNum > 150) {
      Alert.alert('Invalid Age', 'Please enter a valid age between 1 and 150');
      return;
    }

    setStatusMsg('Registering employee...');

    // Call the production-grade registration hook
    const result = await registerEmployee(name.trim(), designation, 'General');

    if (result.success) {
      Logger.info(`[REGISTRATION] ✓ Registration successful: ${name} (${result.employeeId})`);
      
      // Reset form state
      setName('');
      setAge('');
      setPhone('');
      setEmail('');
      setDesignation('Staff');
      clearCapture();
      setStatusMsg('Point camera at your face then tap Capture');
      
      // Navigate back or refresh
      if (onSuccess) onSuccess();
    } else {
      Logger.error(`[REGISTRATION] Registration failed: ${result.error}`);
      setStatusMsg('❌ Registration failed — try again');
    }
  };

  return (
    <ScrollView contentContainerStyle={s.scrollContainer} style={s.container}>
      <View style={s.card}>
        <Text style={s.title}>{reRegisterId ? 'Re-Register Face' : 'Register Face'}</Text>
        <Text style={s.sub}>
          {modelReady ? '🤖 AI Mode' : '⚠️ Demo Mode'}
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
              <View style={[s.badge, hasCapturedFace && s.badgeGreen]} pointerEvents="none">
                <Text style={s.badgeTxt}>
                  {hasCapturedFace ? '✅ Face Captured' : '👤 Align Face in Oval'}
                </Text>
              </View>
            </>
          )}
        </View>

        <Text style={s.status}>{statusMsg}</Text>

        {/* Capture button */}
        <TouchableOpacity
          style={[s.captureBtn, (isRegistering && !hasCapturedFace) && s.btnDis]}
          onPress={handleCapture}
          disabled={isRegistering && !hasCapturedFace}
        >
          {(isRegistering && !hasCapturedFace)
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.captureBtnTxt}>
                {hasCapturedFace ? '🔄 Recapture' : '📸 Capture Face'}
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
          editable={!isRegistering}
          autoCapitalize="words"
        />

        <TextInput
          style={s.input}
          placeholder="Age *"
          placeholderTextColor="#aaa"
          value={age}
          onChangeText={setAge}
          editable={!isRegistering}
          keyboardType="numeric"
        />

        <TextInput
          style={s.input}
          placeholder="Phone Number *"
          placeholderTextColor="#aaa"
          value={phone}
          onChangeText={setPhone}
          editable={!isRegistering}
          keyboardType="phone-pad"
        />

        <TextInput
          style={s.input}
          placeholder="Email Address *"
          placeholderTextColor="#aaa"
          value={email}
          onChangeText={setEmail}
          editable={!isRegistering}
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
              disabled={isRegistering}
            >
              <Text style={[s.chipText, designation === desc && s.chipTextActive]}>
                {desc}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Register button */}
        <TouchableOpacity
          style={[s.btn, (!hasCapturedFace || isRegistering) && s.btnDis]}
          onPress={handleRegister}
          disabled={!hasCapturedFace || isRegistering}
        >
          {(isRegistering && hasCapturedFace)
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnTxt}>Register Employee ✅</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={s.back} onPress={onBack ?? onSuccess} disabled={isRegistering}>
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
