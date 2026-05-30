/**
 * AttendanceScreen - Real-time Face Recognition
 * ✅ Real camera + TFLite face matching
 * ✅ Demo mode fallback (picks a random registered face to simulate a match)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import {
  Camera, useCameraDevice, useCameraPermission, useFrameProcessor,
} from 'react-native-vision-camera';
import { runOnJS } from 'react-native-reanimated';
import { FaceStorage } from '../services/FaceStorage';
import { TFLiteService } from '../services/TFLiteService';
import { cosineSimilarity, MATCH_THRESHOLDS } from '../utils/math';
import { Logger } from '../utils/logger';

interface Props { onBack: () => void; }

interface Record {
  id: string; name: string; confidence: number; time: string; mode: 'ai' | 'demo';
}

export const AttendanceScreen: React.FC<Props> = ({ onBack }) => {
  const [records, setRecords] = useState<Record[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastResult, setLastResult] = useState<string>('Tap Start Scan');
  const [fps, setFps] = useState(0);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const [cameraActive, setCameraActive] = useState(false);
  const modelsReady = TFLiteService.modelsAvailable;
  const fpsRef = useRef(0);
  const lastFrameTime = useRef(0);
  const scanningRef = useRef(false); // mirror of scanning for worklet access

  useEffect(() => {
    (async () => {
      const ok = hasPermission || await requestPermission();
      if (ok) setCameraActive(true);
    })();
    const t = setInterval(() => { setFps(fpsRef.current); fpsRef.current = 0; }, 1000);
    return () => clearInterval(t);
  }, []);

  // Keep ref in sync so worklet can read it without closure issues
  useEffect(() => { scanningRef.current = scanning; }, [scanning]);

  const onMatchFound = useCallback((embArr: number[]) => {
    if (!scanningRef.current) return;
    const emb = new Float32Array(embArr);
    const faces = FaceStorage.getAllFaces();
    if (!faces.length) { setLastResult('No faces registered'); return; }

    let best = { name: 'Unknown', score: 0 };
    for (const f of faces) {
      const score = cosineSimilarity(emb, f.embedding);
      if (score > best.score) best = { name: f.name, score };
    }

    if (best.score >= MATCH_THRESHOLDS.normal) {
      const conf = Math.round(best.score * 100);
      setLastResult(`✅ ${best.name} — ${conf}% match`);
      setRecords(prev => [{
        id: `${best.name}${Date.now()}`, name: best.name, confidence: conf,
        time: new Date().toLocaleTimeString(), mode: 'ai',
      }, ...prev.slice(0, 14)]);
      setScanning(false);
    } else {
      setLastResult(`🔍 Scanning... best: ${Math.round(best.score * 100)}%`);
    }
  }, []);

  const onTick = useCallback(() => { fpsRef.current += 1; }, []);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    runOnJS(onTick)();
    if (!modelsReady || !scanningRef.current) return;
    const now = Date.now();
    if (now - lastFrameTime.current < 400) return; // throttle to ~2fps for matching
    lastFrameTime.current = now;
    try {
      const det = TFLiteService.detectFace(frame as any);
      if (det && det.confidence > 0.5) {
        const emb = TFLiteService.extractEmbedding(frame as any);
        if (emb) runOnJS(onMatchFound)(Array.from(emb));
      }
    } catch (_) {}
  }, [modelsReady, onMatchFound, onTick]);

  const handleDemoMatch = () => {
    const faces = FaceStorage.getAllFaces();
    if (!faces.length) { setLastResult('No faces registered — go register first'); return; }
    const f = faces[Math.floor(Math.random() * faces.length)];
    const conf = Math.round((0.72 + Math.random() * 0.15) * 100);
    setLastResult(`✅ ${f.name} — ${conf}% (demo)`);
    setRecords(prev => [{
      id: `${f.id}${Date.now()}`, name: f.name, confidence: conf,
      time: new Date().toLocaleTimeString(), mode: 'demo',
    }, ...prev.slice(0, 14)]);
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Attendance</Text>
        <Text style={s.sub}>{modelsReady ? '🤖 AI Active' : '⚠️ Demo Mode'}</Text>
      </View>

      {/* Camera */}
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
              isActive={cameraActive}
              frameProcessor={frameProcessor}
              pixelFormat="yuv"
            />
            <View style={s.scanFrame} pointerEvents="none" />
            <View style={s.resultBadge} pointerEvents="none">
              <Text style={s.resultTxt}>{lastResult}</Text>
            </View>
          </>
        )}
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        {[
          { v: `${fps}`, l: 'FPS' },
          { v: `${FaceStorage.getAllFaces().length}`, l: 'Registered' },
          { v: `${records.length}`, l: 'Matched' },
          { v: modelsReady ? '✅' : '⚠️', l: 'AI' },
        ].map(({ v, l }) => (
          <View key={l} style={s.stat}>
            <Text style={s.statV}>{v}</Text>
            <Text style={s.statL}>{l}</Text>
          </View>
        ))}
      </View>

      {/* Buttons */}
      <View style={s.btnRow}>
        {modelsReady ? (
          <TouchableOpacity
            style={[s.scanBtn, scanning && s.stopBtn]}
            onPress={() => { setScanning(p => !p); setLastResult(scanning ? 'Stopped' : 'Scanning...'); }}
          >
            <Text style={s.scanBtnTxt}>{scanning ? '⏹ Stop' : '▶ Start Scan'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.scanBtn} onPress={handleDemoMatch}>
            <Text style={s.scanBtnTxt}>▶ Demo Match</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.backBtn} onPress={onBack}>
          <Text style={s.backBtnTxt}>← Back</Text>
        </TouchableOpacity>
      </View>

      {/* Records */}
      {records.length > 0 && (
        <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
          <Text style={s.listTitle}>Today's Log</Text>
          {records.map(r => (
            <View key={r.id} style={s.row}>
              <View>
                <Text style={s.rowName}>{r.name}</Text>
                <Text style={s.rowMeta}>{r.time} · {r.mode === 'ai' ? 'AI' : 'Demo'}</Text>
              </View>
              <Text style={s.rowConf}>{r.confidence}%</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f7' },
  header: { backgroundColor: '#007AFF', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 18 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff' },
  sub: { fontSize: 13, color: '#cce4ff', marginTop: 2 },
  camBox: {
    height: 270, backgroundColor: '#111', margin: 14, borderRadius: 14,
    overflow: 'hidden', justifyContent: 'center', alignItems: 'center',
  },
  errTxt: { color: '#aaa', fontSize: 14, textAlign: 'center', padding: 20 },
  scanFrame: {
    position: 'absolute', width: 180, height: 180,
    borderWidth: 2, borderColor: '#00ff88', borderRadius: 12, opacity: 0.85,
  },
  resultBadge: {
    position: 'absolute', bottom: 12, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
  },
  resultTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  statsRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: '#fff', marginHorizontal: 14, borderRadius: 12,
    paddingVertical: 10, elevation: 2, marginBottom: 10,
  },
  stat: { alignItems: 'center' },
  statV: { fontSize: 18, fontWeight: '700', color: '#007AFF' },
  statL: { fontSize: 11, color: '#999', marginTop: 1 },
  btnRow: { flexDirection: 'row', gap: 10, marginHorizontal: 14, marginBottom: 10 },
  scanBtn: { flex: 1, backgroundColor: '#007AFF', paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  stopBtn: { backgroundColor: '#d32f2f' },
  scanBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  backBtn: { flex: 1, backgroundColor: '#fff', paddingVertical: 13, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ddd' },
  backBtnTxt: { color: '#555', fontSize: 15, fontWeight: '600' },
  list: { flex: 1, marginHorizontal: 14 },
  listTitle: { fontSize: 13, fontWeight: '700', color: '#444', marginBottom: 6 },
  row: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 7,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    elevation: 1, borderLeftWidth: 4, borderLeftColor: '#4CAF50',
  },
  rowName: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  rowMeta: { fontSize: 11, color: '#999', marginTop: 2 },
  rowConf: { fontSize: 20, fontWeight: '700', color: '#4CAF50' },
});
