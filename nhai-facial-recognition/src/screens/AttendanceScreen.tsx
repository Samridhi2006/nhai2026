/**
 * AttendanceScreen - Real-time Face Recognition & Attendance
 * MVP simplified version - camera integration in Phase 2
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { frameProcessor } from '../processors/frameProcessor.worklet';
import { FaceStorage } from '../services/FaceStorage';
import { Logger } from '../utils/logger';

interface AttendanceScreenProps {
  onBack: () => void;
}

export const AttendanceScreen: React.FC<AttendanceScreenProps> = ({
  onBack,
}) => {
  const [isSimulating, setIsSimulating] = useState(false);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const [cameraActive, setCameraActive] = useState(false);
  const CameraView: any = Camera;

  useEffect(() => {
    (async () => {
      if (!hasPermission) {
        const granted = await requestPermission();
        if (granted) setCameraActive(true);
      } else {
        setCameraActive(true);
      }
    })();
  }, [hasPermission]);

  const simulateAttendance = async () => {
    try {
      setIsSimulating(true);
      Logger.info('Simulating attendance check...');

      if (FaceStorage.getAllFaces().length === 0) {
        Alert.alert('No Faces', 'Please register a face first');
        setIsSimulating(false);
        return;
      }

      // Simulate detection and matching
      const mockEmbedding = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        mockEmbedding[i] = Math.random() * 2 - 1;
      }

      // TODO: In production, this would use TFLiteService to create real embeddings
      // For now, we just show the simulation
      Logger.info('Mock embedding created for testing');
      Alert.alert('Demo', 'Attendance simulation running with mock data');
    } catch (error) {
      Logger.error('Attendance check failed', error);
      Alert.alert('Error', 'Attendance check failed');
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Take Attendance</Text>
        <Text style={styles.subtitle}>Real-time Face Recognition</Text>
      </View>

      <View style={styles.previewArea}>
        {!hasPermission && (
          <View style={styles.fallbackContainer}>
            <Text style={styles.errorText}>
              Camera permission is mandatory for logging field operations.
            </Text>
          </View>
        )}

        {hasPermission && !device && (
          <View style={styles.fallbackContainer}>
            <Text style={styles.errorText}>
              Front camera device layer missing or hardware faulty.
            </Text>
          </View>
        )}

        {device && (
          <CameraView
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={cameraActive}
            frameProcessor={frameProcessor}
            frameProcessorFps={30}
          />
        )}

        <View style={styles.overlayLayer} pointerEvents="none">
          <Text style={styles.uiLabelText}>Align Face Inside Scanner</Text>
        </View>
      </View>

      <View style={styles.statsBox}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>30</Text>
          <Text style={styles.statLabel}>FPS</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{`<500`}</Text>
          <Text style={styles.statLabel}>ms</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>✓</Text>
          <Text style={styles.statLabel}>Liveness</Text>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.simulateButton,
            isSimulating && styles.buttonDisabled,
          ]}
          onPress={simulateAttendance}
          disabled={isSimulating}
        >
          <Text style={styles.buttonText}>
            {isSimulating ? 'Processing...' : 'Simulate Attendance'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          disabled={isSimulating}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#E0E0E0',
    marginTop: 4,
  },
  previewArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    elevation: 2,
  },
  fallbackContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#ff3b30', fontSize: 16, textAlign: 'center' },
  overlayLayer: { position: 'absolute', bottom: 50, left: 0, right: 0, alignItems: 'center' },
  uiLabelText: { color: '#fff', fontSize: 18, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.6)', padding: 12, borderRadius: 8 },
  placeholderText: {
    fontSize: 60,
    marginBottom: 16,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  placeholderDescription: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  resultBox: {
    backgroundColor: '#E8F5E9',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  resultTitle: {
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: '600',
    marginBottom: 4,
  },
  resultName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1B5E20',
    marginBottom: 4,
  },
  resultConfidence: {
    fontSize: 14,
    color: '#2E7D32',
  },
  statsBox: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 8,
    paddingVertical: 12,
    marginBottom: 16,
    elevation: 2,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  simulateButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  backButton: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
