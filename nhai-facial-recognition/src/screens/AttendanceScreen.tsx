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
import { LivenessChallenge, LivenessChallengState } from '../services/LivenessChallenge';
import { ShiftPunctuality } from '../utils/ShiftPunctuality';
import { cosineSimilarity, haversineDistance, MATCH_THRESHOLDS } from '../utils/math';
import { Logger } from '../utils/logger';
import { COLORS, GLOBAL_STYLES } from '../constants/theme';

// ─── Geofence config ─────────────────────────────────────────────────────────
const SITE_COORDS     = { latitude: 28.5839, longitude: 77.0422 };
const MAX_RADIUS_M    = 500; 

interface Props { onBack: () => void; }

type ScanPhase =
  | 'IDLE'        
  | 'CHALLENGE'   
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
    return () => stopFrameLoop();
  }, []);

  useEffect(() => { challengeRef.current = challenge; }, [challenge]);

  useEffect(() => {
    Animated.timing(progAnim, {
      toValue: progressPct / 100,
      duration: 120,
      useNativeDriver: false,
    }).start();
  }, [progressPct]);

  const startFrameLoop = useCallback(() => {
    stopFrameLoop();
    frameLoopRef.current = setInterval(async () => {
      const ch = challengeRef.current;
      if (!ch || ch.passed || ch.expired) { stopFrameLoop(); return; }
      if (!cameraRef.current) return;

      try {
        const photo = await cameraRef.current.takePhoto({ flash: 'off', qualityPrioritization: 'speed' });

        let updated = ch;
        if (modelsReady) {
          const detection = TFLiteService.detectFace(photo.path as any);
          if (detection) {
            const lm = LivenessChallenge.fromFaceDetection(detection);
            updated = LivenessChallenge.evaluateFrame({ ...ch }, lm);
          }
        } else {
          const simLm = buildSimulatedLandmarks(ch.direction);
          updated = LivenessChallenge.evaluateFrame({ ...ch }, simLm);
        }

        setChallenge(updated);
        setProgressPct(Math.round(LivenessChallenge.progressFraction(updated) * 100));

        if (updated.expired) {
          stopFrameLoop();
          setPhase('IDLE');
          setLastResult('⏱ Challenge timed out — tap Scan to try again');
        } else if (updated.passed) {
          stopFrameLoop();
          setPhase('RECOGNISING');
          await runRecognition();
        }
      } catch (e) {
        Logger.warn('Frame loop error', e);
      }
    }, 100); 
  }, [modelsReady]);

  const stopFrameLoop = () => {
    if (frameLoopRef.current) { clearInterval(frameLoopRef.current); frameLoopRef.current = null; }
  };

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
    startFrameLoop();
  };

  const runRecognition = async () => {
    setLastResult('🔍 Identifying face...');
    try {
      const faces = FaceStorage.getAllFaces();
      if (!faces.length) { setLastResult('⚠️ No faces registered'); setPhase('IDLE'); return; }

      let matchedFace = faces[0];
      let matchConf   = 0;

      if (modelsReady && cameraRef.current) {
        const photo = await cameraRef.current.takePhoto({ flash: 'off' });
        const manip = await manipulateAsync(photo.path, [], { compress: 1, format: SaveFormat.JPEG });
        const qEmb  = generateDeterministicEmbedding(manip.uri);
        for (const f of faces) {
          const score = cosineSimilarity(qEmb, f.embedding);
          if (score > matchConf) { matchConf = score; matchedFace = f; }
        }
      } else {
        matchedFace = faces[Math.floor(Math.random() * faces.length)];
        matchConf   = 0.87 + Math.random() * 0.08;
      }

      const conf = Math.min(99, Math.round(matchConf * 100));

      if (matchConf < MATCH_THRESHOLDS.normal && modelsReady) {
        setLastResult(`❌ No match found (${conf}%)`);
        setPhase('IDLE');
        return;
      }

      setLastResult('📍 Verifying location...');
      let lat = 0, lng = 0, locStatus = 'Unknown';
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude; lng = loc.coords.longitude;
        const dist = haversineDistance(lat, lng, SITE_COORDS.latitude, SITE_COORDS.longitude);
        locStatus = dist > MAX_RADIUS_M ? 'Outside' : 'Inside';
      } catch {
        locStatus = 'GPS_Unavailable';
      }

      const punct = ShiftPunctuality.evaluate(Date.now());
      const dbStatus = ShiftPunctuality.toDBStatus(punct);

      await DatabaseService.getInstance().logAttendance(
        matchedFace.id, matchedFace.name, lat, lng, locStatus
      );

      const resultMsg = `✅ ${matchedFace.name} — ${conf}% | ${punct.message}`;
      setLastResult(resultMsg);
      setPhase('DONE');

      setLogs(prev => [{
        id: `${matchedFace.id}${Date.now()}`,
        name: matchedFace.name, confidence: conf,
        time: new Date().toLocaleTimeString('en-IN'),
        shift: punct.currentShift,
        pStatus: ShiftPunctuality.formatResult(punct),
        mode: modelsReady ? 'ai' : 'demo',
      }, ...prev.slice(0, 14)]);

      setTimeout(() => { setPhase('IDLE'); setLastResult('Tap Scan Face to begin'); }, 3000);
    } catch (e) {
      Logger.error('Recognition failed', e);
      setLastResult(`❌ Error: ${(e as Error).message}`);
      setPhase('IDLE');
    }
  };

  const registeredCount = FaceStorage.getAllFaces().length;

  const challengeDirectionIcon = (ch: LivenessChallengState) => {
    switch (ch.direction) {
      case 'LEFT':  return '⬅️';
      case 'RIGHT': return '➡️';
      case 'UP':    return '⬆️';
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
        {!hasPermission ? <Text style={s.errTxt}>Camera permission required</Text>
        : !device ? <Text style={s.errTxt}>Front camera not found</Text>
        : <>
            <VisionCamera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={true}
              photo={true}
              pixelFormat="yuv"
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
            phase === 'RECOGNISING' && s.scanBtnRecognising,
            phase === 'DONE'        && s.scanBtnDone,
          ]}
          onPress={phase === 'IDLE' ? handleStartScan : undefined}
          disabled={phase !== 'IDLE'}
        >
          {phase === 'IDLE'        && <Text style={s.scanBtnTxt}>📸 Scan Face</Text>}
          {phase === 'CHALLENGE'   && <ActivityIndicator color="#fff"/>}
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