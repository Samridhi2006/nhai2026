/**
 * RegistrationScreen - Face Registration
 * ✅ Real camera with useFrameProcessor
 * ✅ Demo mode fallback when TFLite models not loaded
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import {
  Camera, useCameraDevice, useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { runOnJS } from 'react-native-reanimated';
import { FaceStorage } from '../services/FaceStorage';
import { TFLiteService } from '../services/TFLiteService';
import { Logger } from '../utils/logger';

interface Props {
  onSuccess: () => void;
  onBack?: () => void;
}

export const RegistrationScreen: React.FC<Props> = ({ onSuccess, onBack }) => {
  const [name, setName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Point camera at your face');
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const [cameraActive, setCameraActive] = useState(false);
  const capturedEmbedding = useRef<Float32Array | null>(null);
  const modelsReady = TFLiteService.modelsAvailable;

  useEffect(() => {
    (async () => {
      const ok = hasPermission || await requestPermission();
      if (ok) setCameraActive(true);
    })();
  }, []);

  const onFaceFound = useCallback((embeddingArr: number[]) => {
    if (capturedEmbedding.current) return; // already captured
    capturedEmbedding.current = new Float32Array(embeddingArr);
    setFaceDetected(true);
    setStatusMsg('✅ Face captured — enter name and tap Register');
  }, []);

  // Frame processor runs on native thread — no JS imports allowed inside
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (!modelsReady) return;
    try {
      const det = TFLiteService.detectFace(frame as any);
      if (det && det.confidence > 0.5) {
        const emb = TFLiteService.extractEmbedding(frame as any);
        if (emb) runOnJS(onFaceFound)(Array.from(emb));
      }
    } catch (_) {}
  }, [modelsReady, onFaceFound]);

  const handleRegister = async () => {
    if (!name.trim()) { Alert.alert('Error', 'Please enter a name'); return; }
    setIsProcessing(true);
    try {
      let embedding: Float32Array;
      if (capturedEmbedding.current && modelsReady) {
        embedding = capturedEmbedding.current;
      } else {
        // Demo mode — random normalized embedding
        embedding = new Float32Array(128);
        for (let i = 0; i < 128; i++) embedding[i] = (Math.random() * 2 - 1);
        const mag = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
        for (let i = 0; i < 128; i++) embedding[i] /= mag;
      }
      const faceId = await FaceStorage.registerFace(name.trim(), embedding);
      Logger.info(`Registered: ${name} (${faceId})`);
      Alert.alert(
        'Registered ✅',
        modelsReady ? `${name} registered with AI face scan` : `${name} registered (demo mode)`,
        [{ text: 'OK', onPress: onSuccess }]
      );
      setName('');
      capturedEmbedding.current = null;
      setFaceDetected(false);
      setStatusMsg('Point camera at your face');
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={s.container}>
      <View style={s.card}>
        <Text style={s.title}>Register Face</Text>
        <Text style={s.sub}>
          {modelsReady ? '🤖 AI Detection Active' : '⚠️ Demo Mode (no TFLite models)'}
        </Text>

        {/* Camera box */}
        <View style={s.camBox}>
          {!hasPermission ? (
            <Text style={s.errTxt}>Camera permission required</Text>
          ) : !device ? (
            <Text style={s.errTxt}>Front camera not found</Text>
          ) : (
            <>
              <Camera
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={cameraActive && !isProcessing}
                frameProcessor={frameProcessor}
                pixelFormat="yuv"
              />
              <View style={[s.badge, faceDetected && s.badgeGreen]}>
                <Text style={s.badgeTxt}>
                  {faceDetected ? '✅ Face Ready' : '👤 Scanning...'}
                </Text>
              </View>
            </>
          )}
        </View>

        <Text style={s.status}>{statusMsg}</Text>

        <TextInput
          style={s.input}
          placeholder="Enter employee name"
          placeholderTextColor="#aaa"
          value={name}
          onChangeText={setName}
          editable={!isProcessing}
          autoCapitalize="words"
        />

        <TouchableOpacity
          style={[s.btn, isProcessing && s.btnDis]}
          onPress={handleRegister}
          disabled={isProcessing}
        >
          {isProcessing
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnTxt}>
                {faceDetected ? 'Register Face ✅' : 'Register (Demo Mode)'}
              </Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={s.back} onPress={onBack ?? onSuccess} disabled={isProcessing}>
          <Text style={s.backTxt}>← Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f7', justifyContent: 'center', alignItems: 'center' },
  card: { width: '92%', backgroundColor: '#fff', borderRadius: 16, padding: 22, elevation: 6 },
  title: { fontSize: 24, fontWeight: '800', color: '#1a1a2e', marginBottom: 4 },
  sub: { fontSize: 13, color: '#666', marginBottom: 16 },
  camBox: {
    height: 240, backgroundColor: '#1a1a2e', borderRadius: 12, overflow: 'hidden',
    marginBottom: 10, justifyContent: 'center', alignItems: 'center',
  },
  errTxt: { color: '#ff6b6b', fontSize: 14, textAlign: 'center', padding: 20 },
  badge: {
    position: 'absolute', bottom: 10, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
  },
  badgeGreen: { backgroundColor: 'rgba(0,180,80,0.85)' },
  badgeTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  status: { fontSize: 13, color: '#555', textAlign: 'center', marginBottom: 12 },
  input: {
    backgroundColor: '#f5f7fa', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 16, borderWidth: 1, borderColor: '#e0e0e0', color: '#000', marginBottom: 14,
  },
  btn: { backgroundColor: '#007AFF', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  btnDis: { opacity: 0.5 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  back: { paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10 },
  backTxt: { color: '#666', fontSize: 14, fontWeight: '600' },
});
