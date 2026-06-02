/**
 * AttendanceScreen — with Challenge-Response Liveness + NHAI Shift Punctuality
 *
 * FLOW
 * ────
 * 1. User taps "Scan Face"
 * 2. LivenessChallenge issues a random head-movement prompt
 * 3. While camera is live, landmark geometry is checked each frame
 * 4. Once challenge passes → face recognition runs
 * 5. On match → ShiftPunctuality evaluates punctuality → SQLite write
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Animated, StatusBar,
} from 'react-native';
import {
  Camera as VisionCamera, useCameraDevice, useCameraPermission,
} from 'react-native-vision-camera';
import * as Location from 'expo-location';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { FaceStorage } from '../services/FaceStorage';
import { TFLiteService } from '../services/TFLiteService';
import { DatabaseService } from '../services/DatabaseService';
import { LivenessChallenge, LivenessChallengState, FaceLandmarks } from '../services/LivenessChallenge';
import { EmbeddingService } from '../services/EmbeddingService';
import { ShiftPunctuality } from '../utils/ShiftPunctuality';
import { cosineSimilarity, haversineDistance, MATCH_THRESHOLDS } from '../utils/math';
import { Logger } from '../utils/logger';
import { COLORS } from '../constants/theme';

// ─── Geofence config ─────────────────────────────────────────────────────────
const SITE_COORDS     = { latitude: 28.5839, longitude: 77.0422 };
const MAX_RADIUS_M    = 500; 

interface Props { onBack: () => void; }

type ScanPhase =
  | 'IDLE'        
  | 'CHALLENGE'   
  | 'IDENTITY_PROMPT'
  | 'RECOGNISING' 
  | 'DONE';       

interface LogEntry {
  id: string; name: string; confidence: number;
  time: string; shift: string; pStatus: string; mode: 'ai'|'demo';
}

export const AttendanceScreen: React.FC<Props> = ({ onBack }) => {
  const [phase, setPhase]           = useState<ScanPhase>('IDLE');
  const [lastResult, setLastResult] = useState('Tap Scan Face to begin');
  const [logs, setLogs]             = useState<LogEntry[]>([]);
  const [challenge, setChallenge]   = useState<LivenessChallengState | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [tempEmbedding, setTempEmbedding] = useState<Float32Array | null>(null);

  const { hasPermission, requestPermission } = useCameraPermission();
  const [locPerm, requestLocPerm] = Location.useForegroundPermissions();
  const device    = useCameraDevice('front');
  const cameraRef = useRef<any>(null);
  const frameLoopRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const challengeRef  = useRef<LivenessChallengState | null>(null);
  const modelsReady   = TFLiteService.modelsAvailable;
  const progAnim      = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      if (!hasPermission) await requestPermission();
      if (!locPerm?.granted) await requestLocPerm();
    })();
  }, []);

  useEffect(() => { challengeRef.current = challenge; }, [challenge]);

  useEffect(() => {
    Animated.timing(progAnim, {
      toValue: progressPct / 100,
      duration: 120,
      useNativeDriver: false,
    }).start();
  }, [progressPct]);

  const handleStartScan = () => {
    if (phase !== 'IDLE') return;
    if (!FaceStorage.getAllFaces().length) {
      setLastResult('⚠️ No employees registered — register first'); return;
    }
    const ch = LivenessChallenge.newChallenge();
    setChallenge(ch);
    setProgressPct(0);
    setPhase('CHALLENGE');
    setLastResult(`👁 ${ch.prompt}`);
    
    setTimeout(() => {
      setPhase(p => {
        if (p === 'CHALLENGE') {
          setLastResult('⏱ Challenge timed out — try again');
          return 'IDLE';
        }
        return p;
      });
    }, 10000);
  };

  const handleCapturePose = async () => {
    if (phase !== 'CHALLENGE' || !challenge) return;
    setPhase('RECOGNISING');
    setLastResult('🔍 Verifying Pose...');
    
    let photoPath: string | null = null;
    try {
      if (!cameraRef.current) return;
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      photoPath = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
      
      // 1. Verify Liveness Pose
      const detection = await EmbeddingService.detectFaceFromPath(photoPath);
      if (!detection) {
        setLastResult('❌ Face not detected clearly');
        setPhase('IDLE');
        return;
      }
      
      const passed = LivenessChallenge.evaluateSinglePose(challenge.direction, detection);
      if (!passed) {
        // Recalculate to show in UI
        const lm = LivenessChallenge.fromFaceDetection(detection);
        const fw = lm.faceRight.x - lm.faceLeft.x;
        const fh = lm.faceBottom.y - lm.faceTop.y;
        const yaw = fw > 0 ? ((lm.noseTip.x - lm.faceLeft.x) / fw).toFixed(2) : '0';
        const pitch = fh > 0 ? ((lm.noseTip.y - lm.eyeCentre.y) / fh).toFixed(2) : '0';
        
        setLastResult(`❌ Spoof: Did not ${challenge.prompt} (Y:${yaw}, P:${pitch})`);
        setPhase('IDLE');
        return;
      }
      
      setLastResult('✅ Liveness passed! Extracting temp profile...');

      // 2. Extract Temp Identity from the Liveness photo
      if (modelsReady) {
        const manip = await manipulateAsync(photoPath, [], { compress: 1, format: SaveFormat.JPEG });
        const tempEmb = await EmbeddingService.extractEmbeddingFromPath(manip.uri);
        setTempEmbedding(tempEmb);
      }
      
      setPhase('IDENTITY_PROMPT');
      setLastResult('✅ Passed! Please look straight ahead.');
      
      // Auto-trigger Identity capture after a short delay for good UX
      setTimeout(() => {
        setPhase(p => p === 'IDENTITY_PROMPT' ? 'RECOGNISING' : p);
        if (phase !== 'IDLE') {
          handleCaptureIdentity();
        }
      }, 1500);
      
    } catch (e) {
      Logger.error('Liveness capture failed', e);
      setLastResult(`❌ Error: ${(e as Error).message}`);
      setPhase('IDLE');
    }
  };

  const handleCaptureIdentity = async () => {
    setPhase('RECOGNISING');
    setLastResult('🔍 Capturing Identity...');
    let photoPath: string | null = null;
    
    try {
      const faces = FaceStorage.getAllFaces();
      if (!faces.length) { setLastResult('⚠️ No faces registered'); setPhase('IDLE'); return; }

      let matchedFace = faces[0];
      let matchConf   = 0;

      if (modelsReady && cameraRef.current) {
        const photo = await cameraRef.current.takePhoto({ flash: 'off' });
        photoPath = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
        
        const manip = await manipulateAsync(photoPath, [], { compress: 1, format: SaveFormat.JPEG });
        const finalEmb = await EmbeddingService.extractEmbeddingFromPath(manip.uri);
        
        // 🔒 ANTI-SPOOF CROSS-CHECK (Bait-and-Switch Prevention)
        if (tempEmbedding) {
          const spoofScore = cosineSimilarity(finalEmb, tempEmbedding);
          // Even a side profile should have a >0.4 similarity to the straight photo of the SAME person
          if (spoofScore < 0.4) {
            setLastResult('🚨 Spoof Detected! Face swapped during capture.');
            setPhase('IDLE');
            setTempEmbedding(null);
            return;
          }
        }
        
        // Match against database with STRICT threshold (since this is a straight photo)
        for (const f of faces) {
          const score = cosineSimilarity(finalEmb, f.embedding);
          if (score > matchConf) { matchConf = score; matchedFace = f; }
        }
        
        Logger.info(`Face matching: best score ${matchConf.toFixed(3)}, threshold ${MATCH_THRESHOLDS.strict}`);
      } else {
        // Demo mode
        matchedFace = faces[Math.floor(Math.random() * faces.length)];
        matchConf   = 0.87 + Math.random() * 0.08;
      }

      const conf = Math.min(99, Math.round(matchConf * 100));

      if (matchConf < MATCH_THRESHOLDS.strict && modelsReady) {
        setLastResult(`❌ No match found (${conf}%)`);
        setPhase('IDLE');
        setTempEmbedding(null);
        return;
      }

      setLastResult('📍 Verifying location...');
      let lat = 0, lng = 0, locStatus = 'Unknown';
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
        const dist = haversineDistance(lat, lng, SITE_COORDS.latitude, SITE_COORDS.longitude);
        locStatus = dist > MAX_RADIUS_M ? 'Outside' : 'Inside';
      } catch (locError) {
        locStatus = 'GPS_Unavailable';
      }

      const punct = ShiftPunctuality.evaluate(Date.now());

      await DatabaseService.getInstance().logAttendance(
        matchedFace.id, matchedFace.name, lat, lng, locStatus
      );

      setLastResult(`✅ ${matchedFace.name} — ${conf}% | ${punct.message}`);
      setPhase('DONE');
      setTempEmbedding(null);

      setLogs(prev => [{
        id: `${matchedFace.id}${Date.now()}`,
        name: matchedFace.name,
        confidence: conf,
        time: new Date().toLocaleTimeString('en-IN'),
        shift: punct.currentShift,
        pStatus: ShiftPunctuality.formatResult(punct),
        mode: modelsReady ? 'ai' : 'demo',
      }, ...prev.slice(0, 14)]);

      setTimeout(() => { setPhase('IDLE'); setLastResult('Tap Scan Face to begin'); }, 3000);
    } catch (e) {
      Logger.error('Identity capture failed', e);
      setLastResult(`❌ Error: ${(e as Error).message}`);
      setPhase('IDLE');
      setTempEmbedding(null);
    }
  };



  const registeredCount = FaceStorage.getAllFaces().length;

  const challengeDirectionIcon = (ch: LivenessChallengState) => {
    switch (ch.direction) {
      case 'LEFT':  return '⬅️';
      case 'RIGHT': return '➡️';
      case 'UP':    return '⬆️';
      case 'DOWN':  return '⬇️';
    }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.nhaiNavy}/>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack}><Text style={s.backTxt}>← Back</Text></TouchableOpacity>
        <Text style={s.title}>Attendance Scan</Text>
        <Text style={s.sub}>{modelsReady ? '🤖 AI + Liveness Active' : '⚠️ Demo Mode + Liveness'}</Text>
      </View>

      <View style={s.camBox}>
        {/* eslint-disable-next-line no-negated-condition, no-nested-ternary */}
        {!hasPermission ? <Text style={s.errTxt}>Camera permission required</Text>
        : !device ? <Text style={s.errTxt}>Front camera not found</Text>
        : <>
            <VisionCamera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={true}
              photo={true}
            />
            <View style={[s.faceOval, phase === 'CHALLENGE' && s.faceOvalChallenge, phase === 'DONE' && s.faceOvalDone]} pointerEvents="none"/>

            {phase === 'CHALLENGE' && challenge && (
              <View style={s.challengeOverlay} pointerEvents="none">
                <Text style={s.challengeIcon}>{challengeDirectionIcon(challenge)}</Text>
                <Text style={s.challengePrompt}>{challenge.prompt}</Text>
                <View style={s.progressTrack}>
                  <Animated.View style={[s.progressFill, {
                    width: progAnim.interpolate({ inputRange:[0,1], outputRange:['0%','100%'] }),
                  }]}/>
                </View>
                <Text style={s.progressLabel}>{progressPct}%</Text>
              </View>
            )}

            <View style={s.resultBadge} pointerEvents="none">
              <Text style={s.resultTxt}>{lastResult}</Text>
            </View>
          </>
        }
      </View>

      <View style={s.statsRow}>
        {[
          { v: `${registeredCount}`, l: 'Registered' },
          { v: `${logs.length}`,     l: 'Scanned' },
          { v: ShiftPunctuality.getCurrentShiftName(), l: 'Active Shift' },
        ].map(({ v, l }) => (
          <View key={l} style={s.statBox}>
            <Text style={s.statV}>{v}</Text>
            <Text style={s.statL}>{l}</Text>
          </View>
        ))}
      </View>

      <View style={s.btnRow}>
        <TouchableOpacity
          style={[s.scanBtn,
            phase === 'CHALLENGE'   && s.scanBtnChallenge,
            phase === 'IDENTITY_PROMPT' && s.scanBtnRecognising,
            phase === 'RECOGNISING' && s.scanBtnRecognising,
            phase === 'DONE'        && s.scanBtnDone,
          ]}
          onPress={phase === 'IDLE' ? handleStartScan : phase === 'CHALLENGE' ? handleCapturePose : undefined}
          disabled={phase === 'RECOGNISING' || phase === 'DONE' || phase === 'IDENTITY_PROMPT'}
        >
          {phase === 'IDLE'        && <Text style={s.scanBtnTxt}>📸 Scan Face</Text>}
          {phase === 'CHALLENGE'   && <Text style={s.scanBtnTxt}>🎯 Capture Pose</Text>}
          {phase === 'IDENTITY_PROMPT' && <Text style={s.scanBtnTxt}>📸 Auto Capturing...</Text>}
          {phase === 'RECOGNISING' && <ActivityIndicator color="#fff"/>}
          {phase === 'DONE'        && <Text style={s.scanBtnTxt}>✅ Done</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.backBtn} onPress={onBack}>
          <Text style={s.backBtnTxt}>← Back</Text>
        </TouchableOpacity>
      </View>

      {phase === 'IDLE' && (
        <View style={s.infoCard}>
          <Text style={s.infoTitle}>🛡 Anti-Spoofing Active</Text>
          <Text style={s.infoBody}>
            Before recognition, you'll receive a random head-movement challenge
            (Left / Right / Up). This prevents photo and video replay attacks.
            Recognition only runs after the geometric liveness check passes.
          </Text>
        </View>
      )}

      {logs.length > 0 && (
        <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
          <Text style={s.listTitle}>Today's Log</Text>
          {logs.map(r => (
            <View key={r.id} style={[s.row, r.pStatus.includes('Late') && s.rowLate]}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{r.name}</Text>
                <Text style={s.rowMeta}>{r.time} · {r.shift}</Text>
                <Text style={[s.rowStatus, r.pStatus.includes('Late') ? s.rowStatusLate : s.rowStatusOk]}>
                  {r.pStatus}
                </Text>
              </View>
              <View style={s.confBox}>
                <Text style={s.rowConf}>{r.confidence}%</Text>
                <Text style={s.rowMode}>{r.mode === 'ai' ? 'AI' : 'Demo'}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

// ─── Styling ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eef2f7' },
  header: {
    backgroundColor: COLORS.nhaiNavy || '#0a1628',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 18,
  },
  backTxt: { color: '#4a90d9', fontSize: 14, marginBottom: 4 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff' },
  sub: { fontSize: 13, color: '#cce4ff', marginTop: 2 },
  
  camBox: {
    height: 340,
    backgroundColor: '#1a1a2e',
    margin: 14,
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  errTxt: { color: '#ff6b6b', fontSize: 14, textAlign: 'center', padding: 20 },
  
  faceOval: {
    position: 'absolute',
    width: 180,
    height: 220,
    borderWidth: 2,
    borderColor: '#00ff88',
    borderRadius: 90,
    opacity: 0.7,
  },
  faceOvalChallenge: { borderColor: '#ffaa00', opacity: 0.9 },
  faceOvalDone: { borderColor: '#4CAF50', opacity: 0.5 },
  
  challengeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  challengeIcon: { fontSize: 60, marginBottom: 20 },
  challengePrompt: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 30, paddingHorizontal: 20 },
  progressTrack: { width: 200, height: 6, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#ffaa00' },
  progressLabel: { color: '#fff', fontSize: 12, marginTop: 10 },
  
  resultBadge: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    maxWidth: '90%',
  },
  resultTxt: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    marginHorizontal: 14,
    borderRadius: 12,
    paddingVertical: 12,
    elevation: 2,
    marginBottom: 10,
  },
  statBox: { alignItems: 'center' },
  statV: { fontSize: 20, fontWeight: '700', color: COLORS.nhaiNavy || '#0a1628' },
  statL: { fontSize: 11, color: '#999', marginTop: 2 },
  
  btnRow: { flexDirection: 'row', gap: 10, marginHorizontal: 14, marginBottom: 10 },
  scanBtn: { flex: 1, backgroundColor: '#007AFF', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  scanBtnChallenge: { backgroundColor: '#ffaa00' },
  scanBtnRecognising: { backgroundColor: '#555' },
  scanBtnDone: { backgroundColor: '#4CAF50' },
  scanBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  backBtn: { flex: 1, backgroundColor: '#fff', paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ddd' },
  backBtnTxt: { color: '#555', fontSize: 15, fontWeight: '600' },
  
  infoCard: { marginHorizontal: 14, marginBottom: 10, backgroundColor: '#e3f2fd', padding: 12, borderRadius: 10 },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#0a1628', marginBottom: 4 },
  infoBody: { fontSize: 12, color: '#555', lineHeight: 18 },
  
  list: { flex: 1, marginHorizontal: 14, marginBottom: 10 },
  listTitle: { fontSize: 13, fontWeight: '700', color: '#444', marginBottom: 6 },
  row: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 7,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  rowLate: { borderLeftColor: '#ff6b6b' },
  rowName: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  rowMeta: { fontSize: 11, color: '#999', marginTop: 2 },
  rowStatus: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  rowStatusOk: { color: '#4CAF50' },
  rowStatusLate: { color: '#ff6b6b' },
  confBox: { alignItems: 'flex-end' },
  rowConf: { fontSize: 18, fontWeight: '700', color: '#007AFF' },
  rowMode: { fontSize: 10, color: '#999', marginTop: 2 },
});